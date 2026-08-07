import CoreBluetooth

/// CoreBluetooth transport for a single Shearwater BLE dive computer.
///
/// libdivecomputer has no built-in BLE transport - it only knows how to call
/// synchronous read/write/poll callbacks (see `dc_custom_cbs_t` in custom.h).
/// Those callbacks run on a dedicated background queue (`DiveComputerEngine`'s
/// worker queue), while CoreBluetooth delivers everything asynchronously on
/// `bleQueue`.
///
/// Unlike a serial port, BLE notifications are discrete packets, and
/// Shearwater's own protocol code (shearwater_common_slip_read) relies on
/// that: each `dc_iostream_read()` call is expected to return exactly one
/// notification's raw bytes (it strips a 2-byte per-packet header and looks
/// for a SLIP frame boundary itself). So incoming data is queued as discrete
/// `Data` packets, not flattened into one byte stream - merging two
/// notifications into a single read() result would splice one packet's
/// header into the middle of another's payload and corrupt the SLIP framing.
/// An `NSCondition` guards the queue: `didUpdateValueFor` enqueues a packet
/// and signals it; `read`/`poll` wait on it, re-checking the real queue
/// state on every wakeup (so spurious wakeups are harmless).
public final class BLETransport: NSObject {
  static let shearwaterServiceUUID = CBUUID(string: "FE25C237-0ECE-443C-B0AA-E02033E7029D")
  static let shearwaterCharacteristicUUID = CBUUID(string: "27B7570B-359E-45A3-91BB-CF7E70049BD2")

  private let bleQueue = DispatchQueue(label: "dive-computer.ble")
  private lazy var central = CBCentralManager(delegate: self, queue: bleQueue)

  private var discovered: [String: CBPeripheral] = [:]
  private var connectedPeripheral: CBPeripheral?
  private var txCharacteristic: CBCharacteristic?
  private var rxCharacteristic: CBCharacteristic?

  private var connectCompletion: ((Result<Void, DiveComputerException>) -> Void)?
  private var connectTimeoutWorkItem: DispatchWorkItem?
  private var writeCompletion: ((Error?) -> Void)?

  private let bufferLock = NSCondition()
  private var rxQueue: [Data] = []
  private var isClosed = false

  public var onDeviceDiscovered: ((DiscoveredDevice) -> Void)?
  public var onBluetoothStateChange: ((CBManagerState) -> Void)?
  public var onPeripheralDisconnected: ((Error?) -> Void)?

  public override init() {
    super.init()
  }

  public var bluetoothState: CBManagerState {
    central.state
  }

  public var connectedDeviceId: String? {
    connectedPeripheral?.identifier.uuidString
  }

  public var connectedDeviceName: String? {
    connectedPeripheral?.name
  }

  // MARK: - Scanning

  public func startScan() throws {
    guard central.state == .poweredOn else {
      throw DiveComputerException(.bluetoothUnavailable(state: bluetoothStateDescription(central.state)))
    }
    discovered.removeAll()
    central.scanForPeripherals(withServices: [Self.shearwaterServiceUUID], options: [
      CBCentralManagerScanOptionAllowDuplicatesKey: false,
    ])
  }

  public func stopScan() {
    if central.state == .poweredOn {
      central.stopScan()
    }
  }

  // MARK: - Connect / disconnect

  public func connect(deviceId: String, timeout: TimeInterval, completion: @escaping (Result<Void, DiveComputerException>) -> Void) {
    guard let peripheral = discovered[deviceId] else {
      completion(.failure(DiveComputerException(.deviceNotFound(id: deviceId))))
      return
    }
    guard central.state == .poweredOn else {
      completion(.failure(DiveComputerException(.bluetoothUnavailable(state: bluetoothStateDescription(central.state)))))
      return
    }

    bufferLock.lock()
    isClosed = false
    bufferLock.unlock()
    connectedPeripheral = peripheral
    peripheral.delegate = self
    connectCompletion = completion

    let timeoutItem = DispatchWorkItem { [weak self] in
      guard let self, self.connectCompletion != nil else { return }
      self.central.cancelPeripheralConnection(peripheral)
      self.finishConnect(.failure(DiveComputerException(.connectionTimeout)))
    }
    connectTimeoutWorkItem = timeoutItem
    bleQueue.asyncAfter(deadline: .now() + timeout, execute: timeoutItem)

    central.connect(peripheral, options: nil)
  }

  public func disconnect() {
    markClosed()
    if let peripheral = connectedPeripheral {
      central.cancelPeripheralConnection(peripheral)
    }
    connectedPeripheral = nil
    txCharacteristic = nil
    rxCharacteristic = nil
  }

  private func finishConnect(_ result: Result<Void, DiveComputerException>) {
    connectTimeoutWorkItem?.cancel()
    connectTimeoutWorkItem = nil
    let completion = connectCompletion
    connectCompletion = nil
    completion?(result)
  }

  // MARK: - Custom I/O primitives (called from the engine's background queue)

  /// Mirrors dc_serial_t's `timeout` field: set once via the `set_timeout`
  /// callback, then used by every subsequent read/write until changed again.
  /// < 0 = block forever, 0 = non-blocking, > 0 = timeout in milliseconds.
  private var ioTimeoutMs: Int32 = -1

  func setTimeout(_ timeout: Int32) {
    ioTimeoutMs = timeout
  }

  /// Returns at most one queued BLE notification packet per call - never
  /// merges multiple packets together, since each carries its own framing
  /// header that Shearwater's SLIP parser expects to see at a fixed offset.
  /// Blocks only until *some* packet is available (or the stored timeout
  /// elapses / the transport closes), matching dc_serial_read's status
  /// contract: a timeout is DC_STATUS_SUCCESS with a short (possibly zero)
  /// `actual`, not an error status.
  func ioRead(maxLength: Int) -> (Data, Int32) {
    bufferLock.lock()
    defer { bufferLock.unlock() }

    if ioTimeoutMs != 0 {
      let deadline: Date? = ioTimeoutMs < 0 ? nil : Date().addingTimeInterval(Double(ioTimeoutMs) / 1000.0)
      while rxQueue.isEmpty && !isClosed {
        let signaled = deadline.map { bufferLock.wait(until: $0) } ?? { bufferLock.wait(); return true }()
        if !signaled {
          break // Timed out with nothing available.
        }
      }
    }

    guard let packet = rxQueue.first else {
      return (Data(), isClosed ? -6 : 0)
    }

    if packet.count <= maxLength {
      rxQueue.removeFirst()
      return (packet, 0)
    }

    // Shouldn't happen for Shearwater's <=32-byte BLE frames, but split
    // defensively rather than merging/dropping bytes if it ever does.
    let chunk = packet.prefix(maxLength)
    rxQueue[0].removeFirst(maxLength)
    return (Data(chunk), 0)
  }

  func ioAvailable() -> Int {
    bufferLock.lock()
    defer { bufferLock.unlock() }
    return rxQueue.reduce(0) { $0 + $1.count }
  }

  /// Unlike read, poll's timeout is an explicit parameter (not the stored
  /// ioTimeoutMs), and DOES return DC_STATUS_TIMEOUT literally on timeout -
  /// matching dc_serial_poll in serial_posix.c.
  func ioPoll(timeoutMs: Int32) -> Int32 {
    bufferLock.lock()
    defer { bufferLock.unlock() }

    if !rxQueue.isEmpty {
      return 0
    }
    if isClosed {
      return -6
    }
    if timeoutMs == 0 {
      return -7
    }

    let deadline: Date? = timeoutMs < 0 ? nil : Date().addingTimeInterval(Double(timeoutMs) / 1000.0)
    while rxQueue.isEmpty && !isClosed {
      let signaled = deadline.map { bufferLock.wait(until: $0) } ?? { bufferLock.wait(); return true }()
      if !signaled {
        return rxQueue.isEmpty ? -7 : 0
      }
    }
    return isClosed && rxQueue.isEmpty ? -6 : 0
  }

  /// A single GATT write is all-or-nothing (no partial-byte-write concept
  /// like a serial port), so this either delivers the whole packet or fails;
  /// `.withResponse` lets CoreBluetooth transparently chunk values up to 512
  /// bytes via the ATT queued-write procedure, which comfortably covers
  /// Shearwater command packets.
  func ioWrite(_ data: Data) -> (Int, Int32) {
    guard let peripheral = connectedPeripheral, let characteristic = txCharacteristic else {
      return (0, -6) // DC_STATUS_IO
    }
    if isClosedSafe {
      return (0, -6)
    }

    if characteristic.properties.contains(.write) {
      let sema = DispatchSemaphore(value: 0)
      var writeError: Error?
      bleQueue.async {
        self.writeCompletion = { error in
          writeError = error
          sema.signal()
        }
        peripheral.writeValue(data, for: characteristic, type: .withResponse)
      }
      let deadline: DispatchTime = ioTimeoutMs < 0 ? .distantFuture : .now() + .milliseconds(Int(ioTimeoutMs))
      if sema.wait(timeout: deadline) == .timedOut {
        return (0, 0) // Treated like a short write, not an error - mirrors dc_serial_write on timeout.
      }
      return writeError == nil ? (data.count, 0) : (0, -6)
    } else {
      bleQueue.async {
        peripheral.writeValue(data, for: characteristic, type: .withoutResponse)
      }
      return (data.count, 0)
    }
  }

  func ioPurge() {
    bufferLock.lock()
    rxQueue.removeAll()
    bufferLock.unlock()
  }

  private var isClosedSafe: Bool {
    bufferLock.lock()
    defer { bufferLock.unlock() }
    return isClosed
  }

  func ioClose() {
    markClosed()
  }

  /// Wakes every waiter blocked in `ioRead`/`ioPoll` so a disconnect (or an
  /// explicit close) unblocks them immediately instead of leaving them
  /// waiting out their full timeout.
  private func markClosed() {
    bufferLock.lock()
    isClosed = true
    bufferLock.broadcast()
    bufferLock.unlock()
  }
}

// MARK: - CBCentralManagerDelegate

extension BLETransport: CBCentralManagerDelegate {
  public func centralManagerDidUpdateState(_ central: CBCentralManager) {
    onBluetoothStateChange?(central.state)
  }

  public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
    let id = peripheral.identifier.uuidString
    discovered[id] = peripheral
    let device = DiscoveredDevice()
    device.id = id
    device.name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? "Unknown")
    device.rssi = RSSI.intValue
    onDeviceDiscovered?(device)
  }

  public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.discoverServices([Self.shearwaterServiceUUID])
  }

  public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    finishConnect(.failure(DiveComputerException(.connectionFailed(reason: error?.localizedDescription ?? "unknown"))))
  }

  public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    markClosed()
    if connectCompletion != nil {
      finishConnect(.failure(DiveComputerException(.connectionFailed(reason: error?.localizedDescription ?? "disconnected"))))
    } else {
      onPeripheralDisconnected?(error)
    }
  }
}

// MARK: - CBPeripheralDelegate

extension BLETransport: CBPeripheralDelegate {
  public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error {
      finishConnect(.failure(DiveComputerException(.connectionFailed(reason: error.localizedDescription))))
      return
    }
    guard let service = peripheral.services?.first(where: { $0.uuid == Self.shearwaterServiceUUID }) else {
      finishConnect(.failure(DiveComputerException(.unsupportedDevice(name: peripheral.name ?? "unknown"))))
      return
    }
    peripheral.discoverCharacteristics([Self.shearwaterCharacteristicUUID], for: service)
  }

  public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    if let error {
      finishConnect(.failure(DiveComputerException(.connectionFailed(reason: error.localizedDescription))))
      return
    }
    guard let characteristics = service.characteristics, !characteristics.isEmpty else {
      finishConnect(.failure(DiveComputerException(.unsupportedDevice(name: peripheral.name ?? "unknown"))))
      return
    }

    txCharacteristic = characteristics.first(where: { $0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse) }) ?? characteristics.first
    rxCharacteristic = characteristics.first(where: { $0.properties.contains(.notify) }) ?? characteristics.first

    guard let rxCharacteristic else {
      finishConnect(.failure(DiveComputerException(.unsupportedDevice(name: peripheral.name ?? "unknown"))))
      return
    }
    peripheral.setNotifyValue(true, for: rxCharacteristic)
  }

  public func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    if let error {
      finishConnect(.failure(DiveComputerException(.connectionFailed(reason: error.localizedDescription))))
      return
    }
    finishConnect(.success(()))
  }

  public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard error == nil, let data = characteristic.value, !data.isEmpty else { return }
    bufferLock.lock()
    rxQueue.append(data)
    bufferLock.signal()
    bufferLock.unlock()
  }

  public func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    writeCompletion?(error)
    writeCompletion = nil
  }
}

public func bluetoothStateDescription(_ state: CBManagerState) -> String {
  switch state {
  case .poweredOn: return "poweredOn"
  case .poweredOff: return "poweredOff"
  case .unauthorized: return "unauthorized"
  case .unsupported: return "unsupported"
  case .resetting: return "resetting"
  case .unknown: return "unknown"
  @unknown default: return "unknown"
  }
}
