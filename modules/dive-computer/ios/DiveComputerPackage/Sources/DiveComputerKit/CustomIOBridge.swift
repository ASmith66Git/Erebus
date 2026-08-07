import Foundation
import LibDiveComputer

/// Wraps a `BLETransport` in libdivecomputer's `dc_custom_cbs_t` callback
/// table (custom.h), so the C library drives our CoreBluetooth connection
/// for every read/write/poll it needs - this is the seam libdivecomputer
/// exposes specifically because it has no built-in BLE transport.
///
/// The callbacks below are plain top-level functions (no captured state),
/// which Swift can hand to C as `@convention(c)` function pointers. State is
/// threaded through via the `userdata` pointer, which is an `Unmanaged`
/// reference to the `BLETransport` instance: retained when the iostream is
/// opened, released when libdivecomputer calls `close`.
enum CustomIOBridge {
  static func open(context: OpaquePointer?, transport: BLETransport) -> (OpaquePointer?, dc_status_t) {
    var callbacks = dc_custom_cbs_t(
      set_timeout: dcSetTimeout,
      set_break: dcNoOpSetValue,
      set_dtr: dcNoOpSetValue,
      set_rts: dcNoOpSetValue,
      get_lines: dcGetLines,
      get_available: dcGetAvailable,
      configure: dcConfigure,
      poll: dcPoll,
      read: dcRead,
      write: dcWrite,
      ioctl: dcIoctl,
      flush: dcFlush,
      purge: dcPurge,
      sleep: dcSleep,
      close: dcClose
    )

    let userdata = Unmanaged.passRetained(transport).toOpaque()

    var iostream: OpaquePointer?
    let status = dc_custom_open(&iostream, context, DC_TRANSPORT_BLE, &callbacks, userdata)
    if status != DC_STATUS_SUCCESS {
      // dc_custom_open didn't take ownership; release our extra retain.
      Unmanaged<BLETransport>.fromOpaque(userdata).release()
    }
    return (iostream, status)
  }
}

private func transport(from userdata: UnsafeMutableRawPointer?) -> BLETransport? {
  guard let userdata else { return nil }
  return Unmanaged<BLETransport>.fromOpaque(userdata).takeUnretainedValue()
}

private func dcSetTimeout(_ userdata: UnsafeMutableRawPointer?, _ timeout: Int32) -> dc_status_t {
  transport(from: userdata)?.setTimeout(timeout)
  return DC_STATUS_SUCCESS
}

private func dcNoOpSetValue(_ userdata: UnsafeMutableRawPointer?, _ value: UInt32) -> dc_status_t {
  return DC_STATUS_SUCCESS
}

private func dcGetLines(_ userdata: UnsafeMutableRawPointer?, _ value: UnsafeMutablePointer<UInt32>?) -> dc_status_t {
  value?.pointee = 0
  return DC_STATUS_SUCCESS
}

private func dcGetAvailable(_ userdata: UnsafeMutableRawPointer?, _ value: UnsafeMutablePointer<Int>?) -> dc_status_t {
  value?.pointee = transport(from: userdata)?.ioAvailable() ?? 0
  return DC_STATUS_SUCCESS
}

private func dcConfigure(
  _ userdata: UnsafeMutableRawPointer?,
  _ baudrate: UInt32,
  _ databits: UInt32,
  _ parity: dc_parity_t,
  _ stopbits: dc_stopbits_t,
  _ flowcontrol: dc_flowcontrol_t
) -> dc_status_t {
  // No line settings to configure for a BLE GATT characteristic.
  return DC_STATUS_SUCCESS
}

private func dcPoll(_ userdata: UnsafeMutableRawPointer?, _ timeout: Int32) -> dc_status_t {
  guard let transport = transport(from: userdata) else { return DC_STATUS_IO }
  return dc_status_t(rawValue: transport.ioPoll(timeoutMs: timeout))
}

private func dcRead(
  _ userdata: UnsafeMutableRawPointer?,
  _ data: UnsafeMutableRawPointer?,
  _ size: Int,
  _ actual: UnsafeMutablePointer<Int>?
) -> dc_status_t {
  guard let transport = transport(from: userdata), let data else {
    actual?.pointee = 0
    return DC_STATUS_IO
  }
  let (chunk, status) = transport.ioRead(maxLength: size)
  chunk.copyBytes(to: data.assumingMemoryBound(to: UInt8.self), count: chunk.count)
  actual?.pointee = chunk.count
  return dc_status_t(rawValue: status)
}

private func dcWrite(
  _ userdata: UnsafeMutableRawPointer?,
  _ data: UnsafeRawPointer?,
  _ size: Int,
  _ actual: UnsafeMutablePointer<Int>?
) -> dc_status_t {
  guard let transport = transport(from: userdata), let data else {
    actual?.pointee = 0
    return DC_STATUS_IO
  }
  let payload = Data(bytes: data, count: size)
  let (written, status) = transport.ioWrite(payload)
  actual?.pointee = written
  return dc_status_t(rawValue: status)
}

private func dcIoctl(
  _ userdata: UnsafeMutableRawPointer?,
  _ request: UInt32,
  _ data: UnsafeMutableRawPointer?,
  _ size: Int
) -> dc_status_t {
  return DC_STATUS_UNSUPPORTED
}

private func dcFlush(_ userdata: UnsafeMutableRawPointer?) -> dc_status_t {
  return DC_STATUS_SUCCESS
}

private func dcPurge(_ userdata: UnsafeMutableRawPointer?, _ direction: dc_direction_t) -> dc_status_t {
  transport(from: userdata)?.ioPurge()
  return DC_STATUS_SUCCESS
}

private func dcSleep(_ userdata: UnsafeMutableRawPointer?, _ milliseconds: UInt32) -> dc_status_t {
  Thread.sleep(forTimeInterval: Double(milliseconds) / 1000.0)
  return DC_STATUS_SUCCESS
}

private func dcClose(_ userdata: UnsafeMutableRawPointer?) -> dc_status_t {
  guard let userdata else { return DC_STATUS_SUCCESS }
  let unmanaged = Unmanaged<BLETransport>.fromOpaque(userdata)
  unmanaged.takeUnretainedValue().ioClose()
  unmanaged.release()
  return DC_STATUS_SUCCESS
}
