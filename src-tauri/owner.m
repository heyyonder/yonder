// Touch ID, with the password of the Mac as the fallback (deviceOwnerAuthentication), before the Start of a new task link
// (owner_check in src/main.rs, src/NewTask.tsx). It runs in the process of the app, so macOS names Yonder and shows its
// icon in the dialog: "Yonder is trying to <reason>. Touch ID or enter your password to continue with Yonder." build.rs
// compiles this file into the app. It waits for the answer, so call it from a thread that is not the main thread.
#import <AppKit/AppKit.h>
#import <LocalAuthentication/LocalAuthentication.h>
#include <stdbool.h>

bool yonder_owner_check(const char *reason) {
    LAContext *context = [LAContext new];
    dispatch_semaphore_t done = dispatch_semaphore_create(0);
    __block bool ok = false;
    [context evaluatePolicy:LAPolicyDeviceOwnerAuthentication
            localizedReason:[NSString stringWithUTF8String:reason]
                      reply:^(BOOL success, NSError *error) {
                        ok = success;
                        dispatch_semaphore_signal(done);
                      }];
    dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
    return ok;
}

// The back and forward buttons of some mice post a navigation swipe in the default setting of their driver app, as a
// swipe with three fingers on the trackpad does, not a click of button 4 or 5. Chrome and Safari go back on it, and the
// web view of the app did nothing. So each swipe goes to `step`: -1 for back, 1 for forward. Call it once, on the main
// thread.
void yonder_watch_swipes(void (*step)(int)) {
    [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskSwipe
                                          handler:^NSEvent *(NSEvent *event) {
                                            // A swipe to the left (deltaX 1) goes back, as in Chrome.
                                            if (event.deltaX == 0) return event;
                                            step(event.deltaX > 0 ? -1 : 1);
                                            return nil;
                                          }];
}
