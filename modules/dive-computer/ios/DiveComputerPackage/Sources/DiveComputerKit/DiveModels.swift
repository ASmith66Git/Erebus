import Foundation

/// A dive computer discovered during a BLE scan, before it has been matched
/// against a libdivecomputer descriptor (that match only happens on connect,
/// since `dc_descriptor_filter` needs the transport type + advertised name).
public final class DiscoveredDevice {
  public var id: String = ""
  public var name: String = ""
  public var rssi: Int = 0

  public init() {}

  public func toDictionary() -> [String: Any] {
    ["id": id, "name": name, "rssi": rssi]
  }
}

/// One point of a dive's depth/temperature profile, pulled out of the raw
/// dive buffer via `dc_parser_samples_foreach`.
public final class DiveSampleRecord {
  public var timeSeconds: Int = 0
  public var depthMeters: Double = 0
  public var temperatureCelsius: Double?

  public init() {}

  public func toDictionary() -> [String: Any] {
    var dict: [String: Any] = ["timeSeconds": timeSeconds, "depthMeters": depthMeters]
    if let temperatureCelsius { dict["temperatureCelsius"] = temperatureCelsius }
    return dict
  }
}

/// Fields pulled out of a raw dive buffer via `dc_parser_get_field` /
/// `dc_parser_samples_foreach`, plus the raw buffer itself (hex-encoded) for
/// debugging - this mirrors what the dive list + detail screens need.
public final class DiveRecord {
  public var number: Int = 0
  /// ISO-8601-ish local timestamp, e.g. "2026-06-30T09:41:00" (no timezone - as reported by the dive computer).
  public var datetime: String = ""
  /// `datetime` + `diveTimeSeconds`, same format.
  public var endDatetime: String = ""
  public var diveTimeSeconds: Int = 0
  public var maxDepthMeters: Double = 0
  public var avgDepthMeters: Double = 0
  public var minTemperatureCelsius: Double?
  public var maxTemperatureCelsius: Double?
  public var avgTemperatureCelsius: Double?
  public var surfaceTemperatureCelsius: Double?
  public var atmosphericPressureBar: Double?
  public var salinityDensityKgPerLiter: Double?
  public var diveMode: String?
  public var gasMixOxygenPercent: Double?
  /// Opaque hex string used internally for incremental sync; not meaningful to display.
  public var fingerprint: String = ""
  /// Depth/temperature profile, in chronological order.
  public var samples: [DiveSampleRecord] = []
  /// Full raw dive buffer, hex-encoded, exactly as returned by the dive
  /// computer before any parsing - for debugging/inspection only.
  public var rawDataHex: String = ""

  public init() {}

  public func toDictionary() -> [String: Any] {
    var dict: [String: Any] = [
      "number": number,
      "datetime": datetime,
      "endDatetime": endDatetime,
      "diveTimeSeconds": diveTimeSeconds,
      "maxDepthMeters": maxDepthMeters,
      "avgDepthMeters": avgDepthMeters,
      "fingerprint": fingerprint,
      "samples": samples.map { $0.toDictionary() },
      "rawDataHex": rawDataHex,
    ]
    if let minTemperatureCelsius { dict["minTemperatureCelsius"] = minTemperatureCelsius }
    if let maxTemperatureCelsius { dict["maxTemperatureCelsius"] = maxTemperatureCelsius }
    if let avgTemperatureCelsius { dict["avgTemperatureCelsius"] = avgTemperatureCelsius }
    if let surfaceTemperatureCelsius { dict["surfaceTemperatureCelsius"] = surfaceTemperatureCelsius }
    if let atmosphericPressureBar { dict["atmosphericPressureBar"] = atmosphericPressureBar }
    if let salinityDensityKgPerLiter { dict["salinityDensityKgPerLiter"] = salinityDensityKgPerLiter }
    if let diveMode { dict["diveMode"] = diveMode }
    if let gasMixOxygenPercent { dict["gasMixOxygenPercent"] = gasMixOxygenPercent }
    return dict
  }
}

public enum DiveComputerErrorKind {
  case bluetoothUnavailable(state: String)
  case permissionDenied
  case alreadyScanning
  case alreadyConnected
  case notConnected
  case deviceNotFound(id: String)
  case unsupportedDevice(name: String)
  case connectionTimeout
  case connectionFailed(reason: String)
  case peripheralDisconnected(reason: String?)
  case libraryFailure(function: String, status: Int32)
  case downloadCancelled
  case invalidArguments(reason: String)
}

/// Single error type for every failure mode in this module, so JS always
/// gets a stable `code` + readable `message` regardless of where in the
/// scan -> connect -> download pipeline the failure happened.
public final class DiveComputerException: Error {
  public let kind: DiveComputerErrorKind

  public init(_ kind: DiveComputerErrorKind) {
    self.kind = kind
  }

  public var code: String {
    switch kind {
    case .bluetoothUnavailable: return "ERR_BLUETOOTH_UNAVAILABLE"
    case .permissionDenied: return "ERR_PERMISSION_DENIED"
    case .alreadyScanning: return "ERR_ALREADY_SCANNING"
    case .alreadyConnected: return "ERR_ALREADY_CONNECTED"
    case .notConnected: return "ERR_NOT_CONNECTED"
    case .deviceNotFound: return "ERR_DEVICE_NOT_FOUND"
    case .unsupportedDevice: return "ERR_UNSUPPORTED_DEVICE"
    case .connectionTimeout: return "ERR_CONNECTION_TIMEOUT"
    case .connectionFailed: return "ERR_CONNECTION_FAILED"
    case .peripheralDisconnected: return "ERR_PERIPHERAL_DISCONNECTED"
    case .libraryFailure: return "ERR_LIBDIVECOMPUTER"
    case .downloadCancelled: return "ERR_DOWNLOAD_CANCELLED"
    case .invalidArguments: return "ERR_INVALID_ARGUMENTS"
    }
  }

  public var reason: String {
    switch kind {
    case .bluetoothUnavailable(let state):
      return "Bluetooth is unavailable (state: \(state)). Enable Bluetooth in Settings and grant this app permission."
    case .permissionDenied:
      return "Bluetooth permission was denied. Enable it for this app in Settings > Privacy > Bluetooth."
    case .alreadyScanning:
      return "A scan is already in progress."
    case .alreadyConnected:
      return "Already connected to a dive computer. Disconnect first."
    case .notConnected:
      return "No dive computer is connected."
    case .deviceNotFound(let id):
      return "No discovered device with id \(id). It may be out of range or the scan may have stopped."
    case .unsupportedDevice(let name):
      return "\"\(name)\" was not recognized as a supported Shearwater BLE dive computer."
    case .connectionTimeout:
      return "Timed out connecting to the dive computer."
    case .connectionFailed(let reason):
      return "Failed to connect to the dive computer: \(reason)"
    case .peripheralDisconnected(let reason):
      if let reason {
        return "The dive computer disconnected unexpectedly: \(reason)"
      }
      return "The dive computer disconnected unexpectedly."
    case .libraryFailure(let function, let status):
      return "\(function) failed with libdivecomputer status \(status) (\(dcStatusDescription(status)))."
    case .downloadCancelled:
      return "The dive download was cancelled."
    case .invalidArguments(let reason):
      return reason
    }
  }
}

public func dcStatusDescription(_ status: Int32) -> String {
  switch status {
  case 0: return "DC_STATUS_SUCCESS"
  case 1: return "DC_STATUS_DONE"
  case -1: return "DC_STATUS_UNSUPPORTED"
  case -2: return "DC_STATUS_INVALIDARGS"
  case -3: return "DC_STATUS_NOMEMORY"
  case -4: return "DC_STATUS_NODEVICE"
  case -5: return "DC_STATUS_NOACCESS"
  case -6: return "DC_STATUS_IO"
  case -7: return "DC_STATUS_TIMEOUT"
  case -8: return "DC_STATUS_PROTOCOL"
  case -9: return "DC_STATUS_DATAFORMAT"
  case -10: return "DC_STATUS_CANCELLED"
  default: return "unknown"
  }
}
