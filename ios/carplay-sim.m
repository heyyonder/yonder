// Turns the CarPlay display of a simulator on or off, with the private SimDevice method enableCarPlay:error: of
// CoreSimulator. Xcode 27 has no Simulator app with an I/O menu. See docs/wiki/carplay.md. Run it with:
//   clang -fobjc-arc -framework Foundation -o /tmp/carplay-sim ios/carplay-sim.m && /tmp/carplay-sim <UDID> on
#import <Foundation/Foundation.h>
#import <objc/message.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 3) return 2;
    NSString *udid = @(argv[1]);
    BOOL on = strcmp(argv[2], "on") == 0;
    NSBundle *bundle = [NSBundle bundleWithPath:@"/Library/Developer/PrivateFrameworks/CoreSimulator.framework"];
    NSError *error = nil;
    if (![bundle loadAndReturnError:&error]) { NSLog(@"load: %@", error); return 1; }
    Class context = NSClassFromString(@"SimServiceContext");
    id ctx = ((id (*)(id, SEL, id, NSError **))objc_msgSend)(context, NSSelectorFromString(@"sharedServiceContextForDeveloperDir:error:"),
                                                              @"/Applications/Xcode.app/Contents/Developer", &error);
    if (!ctx) { NSLog(@"context: %@", error); return 1; }
    id set = ((id (*)(id, SEL, NSError **))objc_msgSend)(ctx, NSSelectorFromString(@"defaultDeviceSetWithError:"), &error);
    NSDictionary *devices = ((id (*)(id, SEL))objc_msgSend)(set, NSSelectorFromString(@"devicesByUDID"));
    id device = devices[[[NSUUID alloc] initWithUUIDString:udid]];
    if (!device) { NSLog(@"no device %@", udid); return 1; }
    SEL sel = NSSelectorFromString(@"enableCarPlay:error:");
    if (![device respondsToSelector:sel]) { NSLog(@"SimDevice has no enableCarPlay:error:"); return 1; }
    BOOL ok = ((BOOL (*)(id, SEL, BOOL, NSError **))objc_msgSend)(device, sel, on, &error);
    NSLog(@"enableCarPlay %d: %d %@", on, ok, error);
    return ok ? 0 : 1;
  }
}
