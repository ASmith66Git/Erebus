import Foundation
import CoreBluetooth

/// `@objc`-compatible facade over `BLETransport` + `DiveComputerEngine`, so an
/// Objective-C `RCTEventEmitter` subclass (see DiveComputerBridge.m in the
/// app target) can drive this package without Swift's `DiveComputerException`
/// or `Record`-style types crossing the Objective-C boundary directly. All
/// the state-machine/error logic lives here rather than in the Objective-C
/// caller, which stays a thin pass-through.
@objc(DiveComputerFacade)
public final class DiveComputerFacade: NSObject {
  private enum State {
    case idle
    case scanning
    case connecting
    case connected
    case downloading
  }

  private var state: State = .idle
  private let engine = DiveComputerEngine()

  private let onDeviceFound: ([String: Any]) -> Void
  private let onScanStateChange: (Bool) -> Void
  private let onConnectionStateChange: (String) -> Void
  private let onDownloadProgress: (Int, Int) -> Void
  private let onBluetoothStateChange: (String) -> Void
  private let onError: (String, String) -> Void

  /// Set for the duration of an app-initiated `disconnect()`. Tearing down
  /// libdivecomputer sends a shutdown command over BLE, and the resulting
  /// peripheral disconnect (or our own subsequent `cancelPeripheralConnection`)
  /// can surface to CoreBluetooth as a CBError (even `.connectionTimeout`)
  /// rather than a clean disconnect - without this flag that gets
  /// misreported to JS as an unexpected disconnect even though it's exactly
  /// what we asked for.
  private var isDisconnectingIntentionally = false

  /// Retains the throwaway central manager created by
  /// `requestEnableBluetooth` — the system power alert it triggers can be
  /// torn down if the manager deallocates too early. Replaced on each
  /// request so the alert re-shows.
  private var powerAlertManager: CBCentralManager?

  private lazy var transport: BLETransport = {
    let instance = BLETransport()
    instance.onDeviceDiscovered = { [weak self] device in
      self?.onDeviceFound(device.toDictionary())
    }
    instance.onBluetoothStateChange = { [weak self] cbState in
      self?.onBluetoothStateChange(bluetoothStateDescription(cbState))
    }
    instance.onPeripheralDisconnected = { [weak self] error in
      self?.handleUnexpectedDisconnect(error)
    }
    return instance
  }()

  @objc(initWithOnDeviceFound:onScanStateChange:onConnectionStateChange:onDownloadProgress:onBluetoothStateChange:onError:)
  public init(
    onDeviceFound: @escaping ([String: Any]) -> Void,
    onScanStateChange: @escaping (Bool) -> Void,
    onConnectionStateChange: @escaping (String) -> Void,
    onDownloadProgress: @escaping (Int, Int) -> Void,
    onBluetoothStateChange: @escaping (String) -> Void,
    onError: @escaping (String, String) -> Void
  ) {
    self.onDeviceFound = onDeviceFound
    self.onScanStateChange = onScanStateChange
    self.onConnectionStateChange = onConnectionStateChange
    self.onDownloadProgress = onDownloadProgress
    self.onBluetoothStateChange = onBluetoothStateChange
    self.onError = onError
    super.init()
  }

  @objc public func getBluetoothState() -> String {
    bluetoothStateDescription(transport.bluetoothState)
  }

  /// iOS counterpart of Android's ACTION_REQUEST_ENABLE dialog. Bluetooth
  /// can't be enabled programmatically here; the closest supported behavior
  /// is CoreBluetooth's system "Turn On Bluetooth" alert, shown when a
  /// central manager is created with ShowPowerAlert while Bluetooth is off.
  /// Resolves immediately with whether Bluetooth is currently on — the JS
  /// wrapper polls the state after the user reacts to the alert (see
  /// waitForIosBluetoothAfterPrompt in diveComputerNative.ts).
  @objc(requestEnableBluetoothWithResolve:reject:)
  public func requestEnableBluetooth(resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    switch transport.bluetoothState {
    case .poweredOn:
      resolve(true)
      return
    case .unsupported, .unauthorized:
      resolve(false)
      return
    default:
      break
    }

    DispatchQueue.main.async { [weak self] in
      self?.powerAlertManager = CBCentralManager(
        delegate: nil,
        queue: nil,
        options: [CBCentralManagerOptionShowPowerAlertKey: true]
      )
      resolve(false)
    }
  }

  @objc public func stopScan() {
    transport.stopScan()
    if state == .scanning {
      state = .idle
    }
    onScanStateChange(false)
  }

  @objc public func cancelDownload() {
    engine.cancelDownload()
  }

  @objc(startScanWithResolve:reject:)
  public func startScan(resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    guard state == .idle else {
      self.reject(reject, DiveComputerException(.alreadyScanning))
      return
    }
    do {
      try transport.startScan()
      state = .scanning
      onScanStateChange(true)
      resolve(nil)
    } catch let error as DiveComputerException {
      self.reject(reject, error)
    } catch {
      self.reject(reject, DiveComputerException(.connectionFailed(reason: error.localizedDescription)))
    }
  }

  @objc(connectWithDeviceId:resolve:reject:)
  public func connect(deviceId: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    guard state == .idle || state == .scanning else {
      self.reject(reject, DiveComputerException(.alreadyConnected))
      return
    }

    transport.stopScan()
    state = .connecting
    onScanStateChange(false)
    onConnectionStateChange("connecting")

    transport.connect(deviceId: deviceId, timeout: 15) { [weak self] connectResult in
      guard let self else { return }
      switch connectResult {
      case .failure(let error):
        self.state = .idle
        self.onConnectionStateChange("disconnected")
        self.reject(reject, error)

      case .success:
        let deviceName = self.transport.connectedDeviceName ?? "Unknown"
        self.engine.open(transport: self.transport, deviceName: deviceName) { openResult in
          switch openResult {
          case .success:
            self.state = .connected
            self.onConnectionStateChange("connected")
            resolve(nil)

          case .failure(let error):
            self.transport.disconnect()
            self.state = .idle
            self.onConnectionStateChange("disconnected")
            self.reject(reject, error)
          }
        }
      }
    }
  }

  /// `knownDives` is an array of `{ dateTimeEpochMs: Number, durationSeconds: Number }`
  /// dictionaries describing dives the app already has - the download stops
  /// at the first device dive that matches one (see DiveComputerEngine.KnownDive).
  @objc(downloadDivesWithKnownDives:resolve:reject:)
  public func downloadDives(knownDives: [[String: Any]], resolve: @escaping ([Any]) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    guard state == .connected else {
      self.reject(reject, DiveComputerException(.notConnected))
      return
    }

    state = .downloading

    let parsedKnownDives: [DiveComputerEngine.KnownDive] = knownDives.compactMap { entry in
      guard let epochMs = (entry["dateTimeEpochMs"] as? NSNumber)?.doubleValue,
            let duration = (entry["durationSeconds"] as? NSNumber)?.intValue else {
        return nil
      }
      return DiveComputerEngine.KnownDive(dateTimeEpochMs: epochMs, durationSeconds: duration)
    }

    engine.downloadDives(knownDives: parsedKnownDives, onProgress: { [weak self] current, maximum in
      self?.onDownloadProgress(current, maximum)
    }, completion: { [weak self] result in
      guard let self else { return }
      self.state = .connected
      switch result {
      case .success(let dives):
        resolve(dives.map { $0.toDictionary() })
      case .failure(let error):
        self.onError(error.code, error.reason)
        self.reject(reject, error)
      }
    })
  }

  @objc(disconnectWithResolve:reject:)
  public func disconnect(resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, Error?) -> Void) {
    isDisconnectingIntentionally = true
    engine.close { [weak self] in
      guard let self else { return }
      self.transport.disconnect()
      self.state = .idle
      self.onConnectionStateChange("disconnected")
      self.isDisconnectingIntentionally = false
      resolve(nil)
    }
  }

  private func reject(_ reject: (String, String, Error?) -> Void, _ error: DiveComputerException) {
    reject(error.code, error.reason, error)
  }

  private func handleUnexpectedDisconnect(_ underlying: Error?) {
    guard !isDisconnectingIntentionally else { return }
    guard state == .connected || state == .downloading else { return }
    let previousState = state
    engine.close()
    state = .idle
    onConnectionStateChange("disconnected")

    // Surface the raw CBError (domain/code), not just localizedDescription,
    // since that's what actually distinguishes "device timed out mid-transfer"
    // from "app/OS tore the link down" when reproducing on real hardware.
    let reason = (underlying as NSError?).map { "\($0.domain) \($0.code): \($0.localizedDescription)" }
    #if DEBUG
    NSLog("[DiveComputer] Unexpected disconnect during state=%@: %@", "\(previousState)", reason ?? "no error info")
    #endif

    let error = DiveComputerException(.peripheralDisconnected(reason: reason))
    onError(error.code, error.reason)
  }
}
