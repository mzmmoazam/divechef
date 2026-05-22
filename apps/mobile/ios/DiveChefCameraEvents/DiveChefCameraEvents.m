#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(DiveChefCameraEvents, RCTEventEmitter)
RCT_EXTERN_METHOD(activate)
RCT_EXTERN_METHOD(deactivate)
@end
