#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@import DiveComputerKit;

/// Thin Objective-C RCTEventEmitter subclass - all the actual scan/connect/
/// download logic lives in DiveComputerFacade (see DiveComputerFacade.swift
/// in the dive-computer Swift package). This is Objective-C rather than
/// Swift because this project builds against a precompiled React Native
/// Core (React-Core-prebuilt) whose headers a Swift bridging header can't
/// resolve; every other RCTEventEmitter subclass in this dependency tree is
/// Objective-C/C++ for the same reason.
@interface DiveComputerBridge : RCTEventEmitter
@end

@implementation DiveComputerBridge {
  DiveComputerFacade *_facade;
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE(DiveComputer);

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"onDeviceFound",
    @"onScanStateChange",
    @"onConnectionStateChange",
    @"onDownloadProgress",
    @"onBluetoothStateChange",
    @"onError",
  ];
}

- (void)startObserving {
  _hasListeners = YES;
}

- (void)stopObserving {
  _hasListeners = NO;
}

- (void)emit:(NSString *)name body:(id)body {
  if (_hasListeners) {
    [self sendEventWithName:name body:body];
  }
}

- (DiveComputerFacade *)facade {
  if (_facade == nil) {
    __weak DiveComputerBridge *weakSelf = self;
    _facade = [[DiveComputerFacade alloc]
        initWithOnDeviceFound:^(NSDictionary<NSString *, id> *device) {
          [weakSelf emit:@"onDeviceFound" body:device];
        }
        onScanStateChange:^(BOOL scanning) {
          [weakSelf emit:@"onScanStateChange" body:@{@"scanning": @(scanning)}];
        }
        onConnectionStateChange:^(NSString *state) {
          [weakSelf emit:@"onConnectionStateChange" body:@{@"state": state}];
        }
        onDownloadProgress:^(NSInteger current, NSInteger maximum) {
          [weakSelf emit:@"onDownloadProgress" body:@{@"current": @(current), @"maximum": @(maximum)}];
        }
        onBluetoothStateChange:^(NSString *state) {
          [weakSelf emit:@"onBluetoothStateChange" body:@{@"state": state}];
        }
        onError:^(NSString *code, NSString *message) {
          [weakSelf emit:@"onError" body:@{@"code": code, @"message": message}];
        }];
  }
  return _facade;
}

RCT_EXPORT_METHOD(getBluetoothState:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  resolve([self.facade getBluetoothState]);
}

RCT_EXPORT_METHOD(stopScan) {
  [self.facade stopScan];
}

RCT_EXPORT_METHOD(cancelDownload) {
  [self.facade cancelDownload];
}

RCT_EXPORT_METHOD(startScan:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.facade startScanWithResolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(connect:(NSString *)deviceId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [self.facade connectWithDeviceId:deviceId resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(downloadDives:(NSArray *)knownDives
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [self.facade downloadDivesWithKnownDives:(knownDives ?: @[]) resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(disconnect:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.facade disconnectWithResolve:resolve reject:reject];
}

@end
