import Foundation
import LibDiveComputer

/// Drives libdivecomputer once a BLE GATT connection is already open:
/// picks the right dc_descriptor_t for the connected peripheral, opens a
/// dc_device_t over our custom I/O stream, and downloads dives - all via
/// the library's own generic API (dc_device_open/dc_device_foreach), so it
/// owns every protocol detail (handshake, command framing, retries) for
/// whatever Shearwater model we matched.
///
/// All libdivecomputer calls happen on `workQueue`, a single dedicated
/// background queue - required because they block synchronously on
/// BLETransport's semaphore-based read/write/poll, which in turn wait on
/// CoreBluetooth's own (different) delegate queue.
public final class DiveComputerEngine {
  private let workQueue = DispatchQueue(label: "dive-computer.engine")

  private var context: OpaquePointer?
  private var device: OpaquePointer?
  private var iostream: OpaquePointer?
  private var downloadContext: DiveDownloadContext?

  public init() {}

  public var isOpen: Bool {
    device != nil
  }

  public func open(transport: BLETransport, deviceName: String, completion: @escaping (Result<Void, DiveComputerException>) -> Void) {
    workQueue.async {
      var ctx: OpaquePointer?
      let contextStatus = dc_context_new(&ctx)
      guard contextStatus == DC_STATUS_SUCCESS, let ctx else {
        completion(.failure(DiveComputerException(.libraryFailure(function: "dc_context_new", status: contextStatus.rawValue))))
        return
      }
      dc_context_set_loglevel(ctx, DC_LOGLEVEL_INFO)
      dc_context_set_logfunc(ctx, dcLogFunc, nil)

      guard let descriptor = Self.findShearwaterDescriptor(context: ctx, name: deviceName) else {
        dc_context_free(ctx)
        completion(.failure(DiveComputerException(.unsupportedDevice(name: deviceName))))
        return
      }

      let (stream, ioStatus) = CustomIOBridge.open(context: ctx, transport: transport)
      guard ioStatus == DC_STATUS_SUCCESS, let stream else {
        dc_descriptor_free(descriptor)
        dc_context_free(ctx)
        completion(.failure(DiveComputerException(.libraryFailure(function: "dc_custom_open", status: ioStatus.rawValue))))
        return
      }

      var dev: OpaquePointer?
      let openStatus = dc_device_open(&dev, ctx, descriptor, stream)
      dc_descriptor_free(descriptor)
      guard openStatus == DC_STATUS_SUCCESS, let dev else {
        dc_iostream_close(stream)
        dc_context_free(ctx)
        completion(.failure(DiveComputerException(.libraryFailure(function: "dc_device_open", status: openStatus.rawValue))))
        return
      }

      self.context = ctx
      self.iostream = stream
      self.device = dev
      completion(.success(()))
    }
  }

  /// One dive the app already has, used to stop the download early: the
  /// device returns dives newest-first, so the first fetched dive whose
  /// start time and duration match a known dive means everything from there
  /// on is already in the app.
  public struct KnownDive {
    /// Dive start in milliseconds since the epoch, computed by parsing the
    /// device's local wall-clock time in the phone's current calendar - the
    /// same way the app parsed it when the dive was originally uploaded.
    public let dateTimeEpochMs: Double
    public let durationSeconds: Int

    public init(dateTimeEpochMs: Double, durationSeconds: Int) {
      self.dateTimeEpochMs = dateTimeEpochMs
      self.durationSeconds = durationSeconds
    }
  }

  public func downloadDives(
    knownDives: [KnownDive] = [],
    maxDives: Int = .max,
    onProgress: @escaping (Int, Int) -> Void,
    completion: @escaping (Result<[DiveRecord], DiveComputerException>) -> Void
  ) {
    workQueue.async {
      guard let device = self.device else {
        completion(.failure(DiveComputerException(.notConnected)))
        return
      }

      let downloadCtx = DiveDownloadContext(device: device, maxDives: maxDives, knownDives: knownDives, onProgress: onProgress)
      self.downloadContext = downloadCtx
      let userdata = Unmanaged.passUnretained(downloadCtx).toOpaque()

      dc_device_set_events(device, UInt32(DC_EVENT_PROGRESS.rawValue), dcEventCallback, userdata)
      dc_device_set_cancel(device, dcCancelCallback, userdata)

      // When capped, drive progress from our own per-dive counter instead of
      // libdivecomputer's raw DC_EVENT_PROGRESS (see dcEventCallback): the
      // Shearwater backend estimates `maximum` as a full manifest page
      // (100+ slots) during the manifest-scan phase, then corrects it down
      // once it learns the real dive count. For a device with few dives that
      // correction happens almost immediately, so the reported percentage
      // barely moves and then jumps straight to ~100% - not what a progress
      // bar should look like. Since we already know the true denominator
      // (maxDives) here, just report against that instead.
      if maxDives != .max {
        onProgress(0, maxDives)
      }

      // Note: no dc_device_set_fingerprint here. Incremental sync is driven
      // by `knownDives` matching in dcDiveCallback instead - a device-side
      // fingerprint would mark every downloaded dive as synced even when the
      // user chose not to upload it, silently hiding it from later imports.
      let status = dc_device_foreach(device, dcDiveCallback, userdata)
      self.downloadContext = nil

      if let error = downloadCtx.lastError {
        completion(.failure(error))
        return
      }

      guard status == DC_STATUS_SUCCESS || status == DC_STATUS_DONE else {
        if status == DC_STATUS_CANCELLED {
          completion(.failure(DiveComputerException(.downloadCancelled)))
        } else {
          completion(.failure(DiveComputerException(.libraryFailure(function: "dc_device_foreach", status: status.rawValue))))
        }
        return
      }

      completion(.success(downloadCtx.dives))
    }
  }

  public func cancelDownload() {
    downloadContext?.cancelled = true
  }

  public func close(completion: (() -> Void)? = nil) {
    workQueue.async {
      if let device = self.device {
        dc_device_close(device)
      }
      if let iostream = self.iostream {
        dc_iostream_close(iostream)
      }
      if let context = self.context {
        dc_context_free(context)
      }
      self.device = nil
      self.iostream = nil
      self.context = nil
      completion?()
    }
  }

  /// Iterates every dive computer libdivecomputer knows about and returns
  /// the first one that (a) supports BLE, (b) is in the Shearwater Petrel
  /// or Predator family (the "special Shearwater Predix" targeting), and
  /// (c) matches the peripheral's advertised name via the library's own
  /// `dc_descriptor_filter` (which encodes each model's real name patterns,
  /// e.g. "Perdix", "Predix", "Petrel", "Teric", "NERD" - not guessed here).
  private static func findShearwaterDescriptor(context: OpaquePointer, name: String) -> OpaquePointer? {
    var iterator: OpaquePointer?
    guard dc_descriptor_iterator_new(&iterator, context) == DC_STATUS_SUCCESS, let iterator else {
      return nil
    }
    defer { dc_iterator_free(iterator) }

    while true {
      var descriptor: OpaquePointer?
      guard dc_iterator_next(iterator, &descriptor) == DC_STATUS_SUCCESS, let descriptor else {
        break
      }

      let family = dc_descriptor_get_type(descriptor)
      let transports = dc_descriptor_get_transports(descriptor)
      let isShearwater = family == DC_FAMILY_SHEARWATER_PETREL || family == DC_FAMILY_SHEARWATER_PREDATOR
      let supportsBLE = (transports & DC_TRANSPORT_BLE.rawValue) != 0

      if isShearwater && supportsBLE {
        let matches = name.withCString { cName in
          dc_descriptor_filter(descriptor, DC_TRANSPORT_BLE, cName) != 0
        }
        if matches {
          return descriptor
        }
      }

      dc_descriptor_free(descriptor)
    }
    return nil
  }
}

/// Per-download mutable state, threaded through libdivecomputer's C
/// callbacks via an `Unmanaged` `userdata` pointer (see dcDiveCallback /
/// dcEventCallback below - both are non-capturing top-level functions so
/// they can be handed to C as plain function pointers).
final class DiveDownloadContext {
  let device: OpaquePointer
  let onProgress: (Int, Int) -> Void
  let maxDives: Int
  let knownDives: [DiveComputerEngine.KnownDive]
  var dives: [DiveRecord] = []
  var lastError: DiveComputerException?
  var cancelled = false

  init(device: OpaquePointer, maxDives: Int, knownDives: [DiveComputerEngine.KnownDive], onProgress: @escaping (Int, Int) -> Void) {
    self.device = device
    self.maxDives = maxDives
    self.knownDives = knownDives
    self.onProgress = onProgress
  }

  /// Matches with tolerance rather than equality: the device clock and the
  /// stored record can disagree by a few seconds (clock drift, second
  /// truncation on upload), and duration can differ by a rounding step.
  /// A missing/zero stored duration acts as a wildcard - a start time within
  /// the window is decisive enough on its own.
  func isKnown(startEpochMs: Double, durationSeconds: Int) -> Bool {
    knownDives.contains { known in
      abs(known.dateTimeEpochMs - startEpochMs) <= 120_000 &&
        (known.durationSeconds <= 0 || abs(known.durationSeconds - durationSeconds) <= 60)
    }
  }
}

private func dcEventCallback(
  _ device: OpaquePointer?,
  _ event: dc_event_type_t,
  _ data: UnsafeRawPointer?,
  _ userdata: UnsafeMutableRawPointer?
) {
  guard event == DC_EVENT_PROGRESS, let data, let userdata else { return }
  let ctx = Unmanaged<DiveDownloadContext>.fromOpaque(userdata).takeUnretainedValue()
  // When capped, dcDiveCallback reports progress against maxDives instead
  // (see the comment in downloadDives) - don't also forward this raw event,
  // which would just overwrite that with its own jumpy estimate.
  guard ctx.maxDives == .max else { return }
  let progress = data.assumingMemoryBound(to: dc_event_progress_t.self).pointee
  ctx.onProgress(Int(progress.current), Int(progress.maximum))
}

private func dcCancelCallback(_ userdata: UnsafeMutableRawPointer?) -> Int32 {
  guard let userdata else { return 0 }
  let ctx = Unmanaged<DiveDownloadContext>.fromOpaque(userdata).takeUnretainedValue()
  return ctx.cancelled ? 1 : 0
}

private func dcDiveCallback(
  _ data: UnsafePointer<UInt8>?,
  _ size: UInt32,
  _ fingerprint: UnsafePointer<UInt8>?,
  _ fsize: UInt32,
  _ userdata: UnsafeMutableRawPointer?
) -> Int32 {
  guard let userdata else { return 0 }
  let ctx = Unmanaged<DiveDownloadContext>.fromOpaque(userdata).takeUnretainedValue()
  guard let data else { return 1 }

  let fingerprintData = fingerprint.map { Data(bytes: $0, count: Int(fsize)) } ?? Data()

  var parser: OpaquePointer?
  let status = dc_parser_new(&parser, ctx.device, data, Int(size))
  guard status == DC_STATUS_SUCCESS, let parser else {
    ctx.lastError = DiveComputerException(.libraryFailure(function: "dc_parser_new", status: status.rawValue))
    return 1
  }
  defer { dc_parser_destroy(parser) }

  let record = DiveRecord()
  record.number = ctx.dives.count + 1
  record.fingerprint = fingerprintData.map { String(format: "%02x", $0) }.joined()
  record.rawDataHex = Data(bytes: data, count: Int(size)).map { String(format: "%02x", $0) }.joined()

  var startDate: Date?
  var dt = dc_datetime_t()
  if dc_parser_get_datetime(parser, &dt) == DC_STATUS_SUCCESS {
    record.datetime = String(format: "%04d-%02d-%02dT%02d:%02d:%02d", dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second)
    var comps = DateComponents()
    comps.year = Int(dt.year)
    comps.month = Int(dt.month)
    comps.day = Int(dt.day)
    comps.hour = Int(dt.hour)
    comps.minute = Int(dt.minute)
    comps.second = Int(dt.second)
    startDate = Calendar.current.date(from: comps)
  }

  var divetime: UInt32 = 0
  if dc_parser_get_field(parser, DC_FIELD_DIVETIME, 0, &divetime) == DC_STATUS_SUCCESS {
    record.diveTimeSeconds = Int(divetime)
  }

  if let startDate {
    let endDate = startDate.addingTimeInterval(TimeInterval(record.diveTimeSeconds))
    let endComps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: endDate)
    record.endDatetime = String(
      format: "%04d-%02d-%02dT%02d:%02d:%02d",
      endComps.year ?? 0, endComps.month ?? 0, endComps.day ?? 0,
      endComps.hour ?? 0, endComps.minute ?? 0, endComps.second ?? 0
    )
  }

  // Dives arrive newest-first, so hitting one the app already has (same
  // start time + duration) means the rest are already imported - stop the
  // download here without keeping this dive.
  if let startDate, ctx.isKnown(startEpochMs: startDate.timeIntervalSince1970 * 1000, durationSeconds: record.diveTimeSeconds) {
    return 0
  }

  var maxdepth: Double = 0
  if dc_parser_get_field(parser, DC_FIELD_MAXDEPTH, 0, &maxdepth) == DC_STATUS_SUCCESS {
    record.maxDepthMeters = maxdepth
  }

  // Shearwater's parser (shearwater_predator_parser.c) doesn't implement
  // DC_FIELD_AVGDEPTH or any of the DC_FIELD_TEMPERATURE_* fields at all -
  // dc_parser_get_field returns DC_STATUS_UNSUPPORTED for them, so these are
  // always derived from the sample profile below instead (see `collector`).
  var avgdepth: Double = 0
  if dc_parser_get_field(parser, DC_FIELD_AVGDEPTH, 0, &avgdepth) == DC_STATUS_SUCCESS {
    record.avgDepthMeters = avgdepth
  }

  var tempMin: Double = 0
  if dc_parser_get_field(parser, DC_FIELD_TEMPERATURE_MINIMUM, 0, &tempMin) == DC_STATUS_SUCCESS {
    record.minTemperatureCelsius = tempMin
  }

  var tempMax: Double = 0
  if dc_parser_get_field(parser, DC_FIELD_TEMPERATURE_MAXIMUM, 0, &tempMax) == DC_STATUS_SUCCESS {
    record.maxTemperatureCelsius = tempMax
  }

  var tempSurface: Double = 0
  if dc_parser_get_field(parser, DC_FIELD_TEMPERATURE_SURFACE, 0, &tempSurface) == DC_STATUS_SUCCESS {
    record.surfaceTemperatureCelsius = tempSurface
  }

  var atmospheric: Double = 0
  if dc_parser_get_field(parser, DC_FIELD_ATMOSPHERIC, 0, &atmospheric) == DC_STATUS_SUCCESS {
    record.atmosphericPressureBar = atmospheric
  }

  var salinity = dc_salinity_t()
  if dc_parser_get_field(parser, DC_FIELD_SALINITY, 0, &salinity) == DC_STATUS_SUCCESS {
    record.salinityDensityKgPerLiter = salinity.density
  }

  var divemode: dc_divemode_t = DC_DIVEMODE_OC
  if dc_parser_get_field(parser, DC_FIELD_DIVEMODE, 0, &divemode) == DC_STATUS_SUCCESS {
    record.diveMode = diveModeDescription(divemode)
  }

  var gasmixCount: UInt32 = 0
  if dc_parser_get_field(parser, DC_FIELD_GASMIX_COUNT, 0, &gasmixCount) == DC_STATUS_SUCCESS, gasmixCount > 0 {
    var gasmix = dc_gasmix_t()
    if dc_parser_get_field(parser, DC_FIELD_GASMIX, 0, &gasmix) == DC_STATUS_SUCCESS {
      record.gasMixOxygenPercent = gasmix.oxygen * 100
    }
  }

  let collector = SampleCollector()
  let sampleUserdata = Unmanaged.passUnretained(collector).toOpaque()
  _ = dc_parser_samples_foreach(parser, dcSampleCallback, sampleUserdata)
  record.samples = collector.samples

  // Fill in whatever DC_FIELD_* didn't cover (see the Shearwater note above)
  // from the sample profile itself.
  if record.avgDepthMeters == 0, collector.depthCount > 0 {
    record.avgDepthMeters = collector.depthSum / Double(collector.depthCount)
  }
  if record.minTemperatureCelsius == nil {
    record.minTemperatureCelsius = collector.minTemperature
  }
  if record.maxTemperatureCelsius == nil {
    record.maxTemperatureCelsius = collector.maxTemperature
  }
  if record.surfaceTemperatureCelsius == nil {
    record.surfaceTemperatureCelsius = collector.firstTemperature
  }
  if collector.temperatureCount > 0 {
    record.avgTemperatureCelsius = collector.temperatureSum / Double(collector.temperatureCount)
  }

  ctx.dives.append(record)
  if ctx.maxDives != .max {
    ctx.onProgress(ctx.dives.count, ctx.maxDives)
  }
  return (ctx.cancelled || ctx.dives.count >= ctx.maxDives) ? 0 : 1
}

/// Accumulates a depth/temperature profile from `dc_parser_samples_foreach`
/// callbacks. Samples arrive as a flat stream of typed values: a
/// DC_SAMPLE_TIME establishes the timestamp for whatever DEPTH/TEMPERATURE
/// samples follow it, until the next TIME sample - not all dive computers
/// report a temperature at every depth sample, so this carries the last
/// known temperature forward onto each depth point.
private final class SampleCollector {
  var samples: [DiveSampleRecord] = []
  var currentTimeMs: UInt32 = 0
  var lastTemperature: Double?

  // Aggregates for fields Shearwater's parser doesn't compute itself.
  var depthSum: Double = 0
  var depthCount: Int = 0
  var temperatureSum: Double = 0
  var temperatureCount: Int = 0
  var minTemperature: Double?
  var maxTemperature: Double?
  var firstTemperature: Double?
}

private func dcSampleCallback(
  _ type: dc_sample_type_t,
  _ value: UnsafePointer<dc_sample_value_t>?,
  _ userdata: UnsafeMutableRawPointer?
) {
  guard let value, let userdata else { return }
  let collector = Unmanaged<SampleCollector>.fromOpaque(userdata).takeUnretainedValue()

  switch type {
  case DC_SAMPLE_TIME:
    collector.currentTimeMs = value.pointee.time
  case DC_SAMPLE_DEPTH:
    let depth = value.pointee.depth
    let sample = DiveSampleRecord()
    sample.timeSeconds = Int(collector.currentTimeMs / 1000)
    sample.depthMeters = depth
    sample.temperatureCelsius = collector.lastTemperature
    collector.samples.append(sample)
    collector.depthSum += depth
    collector.depthCount += 1
  case DC_SAMPLE_TEMPERATURE:
    let temperature = value.pointee.temperature
    collector.lastTemperature = temperature
    if collector.firstTemperature == nil {
      collector.firstTemperature = temperature
    }
    collector.minTemperature = min(collector.minTemperature ?? temperature, temperature)
    collector.maxTemperature = max(collector.maxTemperature ?? temperature, temperature)
    collector.temperatureSum += temperature
    collector.temperatureCount += 1
  default:
    break
  }
}

private func diveModeDescription(_ mode: dc_divemode_t) -> String {
  switch mode {
  case DC_DIVEMODE_FREEDIVE: return "Freedive"
  case DC_DIVEMODE_GAUGE: return "Gauge"
  case DC_DIVEMODE_OC: return "Open Circuit"
  case DC_DIVEMODE_CCR: return "Closed Circuit Rebreather"
  case DC_DIVEMODE_SCR: return "Semi-Closed Circuit Rebreather"
  default: return "Unknown"
  }
}

private func dcLogFunc(
  _ context: OpaquePointer?,
  _ loglevel: dc_loglevel_t,
  _ file: UnsafePointer<Int8>?,
  _ line: UInt32,
  _ function: UnsafePointer<Int8>?,
  _ message: UnsafePointer<Int8>?,
  _ userdata: UnsafeMutableRawPointer?
) {
  #if DEBUG
  let msg = message.map { String(cString: $0) } ?? ""
  let fn = function.map { String(cString: $0) } ?? ""
  NSLog("[libdivecomputer] %@ (%@)", msg, fn)
  #endif
}
