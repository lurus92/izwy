function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
var profiling_1 = require("../../profiling");
var frame_common_1 = require("./frame-common");
var fragment_transitions_1 = require("./fragment.transitions");
var uiUtils = require("tns-core-modules/ui/utils");
var utils = require("../../utils/utils");
__export(require("./frame-common"));
var ENTRY = "_entry";
var NAV_DEPTH = "_navDepth";
var TRANSITION = "_transition";
var DELEGATE = "_delegate";
var navDepth = -1;
var Frame = (function (_super) {
    __extends(Frame, _super);
    function Frame() {
        var _this = _super.call(this) || this;
        _this._animatedDelegate = UINavigationControllerAnimatedDelegate.new();
        _this._shouldSkipNativePop = false;
        _this._isInitialNavigation = true;
        _this._ios = new iOSFrame(_this);
        _this.nativeViewProtected = _this._ios.controller.view;
        var frameRef = new WeakRef(_this);
        frame_common_1.application.ios.addNotificationObserver(UIApplicationDidChangeStatusBarFrameNotification, function (notification) {
            var frame = frameRef.get();
            if (frame) {
                frame._handleHigherInCallStatusBarIfNeeded();
                if (frame.currentPage) {
                    frame.currentPage.requestLayout();
                }
            }
        });
        return _this;
    }
    Frame.prototype.onLoaded = function () {
        _super.prototype.onLoaded.call(this);
        if (this._paramToNavigate) {
            this.navigate(this._paramToNavigate);
            this._paramToNavigate = undefined;
        }
    };
    Frame.prototype.navigate = function (param) {
        if (this.isLoaded) {
            _super.prototype.navigate.call(this, param);
            this._isInitialNavigation = false;
        }
        else {
            this._paramToNavigate = param;
        }
    };
    Frame.prototype._navigateCore = function (backstackEntry) {
        _super.prototype._navigateCore.call(this, backstackEntry);
        var viewController = backstackEntry.resolvedPage.ios;
        if (!viewController) {
            throw new Error("Required page does not have a viewController created.");
        }
        var clearHistory = backstackEntry.entry.clearHistory;
        if (clearHistory) {
            navDepth = -1;
        }
        navDepth++;
        var navigationTransition;
        var animated = this.currentPage ? this._getIsAnimatedNavigation(backstackEntry.entry) : false;
        if (animated) {
            navigationTransition = this._getNavigationTransition(backstackEntry.entry);
            if (navigationTransition) {
                viewController[TRANSITION] = navigationTransition;
            }
        }
        else {
            viewController[TRANSITION] = { name: "non-animated" };
        }
        var nativeTransition = _getNativeTransition(navigationTransition, true);
        if (!nativeTransition && navigationTransition) {
            this._ios.controller.delegate = this._animatedDelegate;
            viewController[DELEGATE] = this._animatedDelegate;
        }
        else {
            viewController[DELEGATE] = null;
            this._ios.controller.delegate = null;
        }
        backstackEntry[NAV_DEPTH] = navDepth;
        viewController[ENTRY] = backstackEntry;
        if (!this._currentEntry) {
            this._updateActionBar(backstackEntry.resolvedPage, true);
            this._ios.controller.pushViewControllerAnimated(viewController, animated);
            if (frame_common_1.traceEnabled()) {
                frame_common_1.traceWrite(this + ".pushViewControllerAnimated(" + viewController + ", " + animated + "); depth = " + navDepth, frame_common_1.traceCategories.Navigation);
            }
            return;
        }
        if (clearHistory) {
            viewController.navigationItem.hidesBackButton = true;
            var newControllers = NSMutableArray.alloc().initWithCapacity(1);
            newControllers.addObject(viewController);
            var oldControllers = this._ios.controller.viewControllers;
            for (var i = 0; i < oldControllers.count; i++) {
                oldControllers.objectAtIndex(i).isBackstackCleared = true;
            }
            this._ios.controller.setViewControllersAnimated(newControllers, animated);
            if (frame_common_1.traceEnabled()) {
                frame_common_1.traceWrite(this + ".setViewControllersAnimated([" + viewController + "], " + animated + "); depth = " + navDepth, frame_common_1.traceCategories.Navigation);
            }
            return;
        }
        if (!Frame._isEntryBackstackVisible(this._currentEntry)) {
            var newControllers = NSMutableArray.alloc().initWithArray(this._ios.controller.viewControllers);
            if (newControllers.count === 0) {
                throw new Error("Wrong controllers count.");
            }
            viewController.navigationItem.hidesBackButton = this.backStack.length === 0;
            var skippedNavController = newControllers.lastObject;
            skippedNavController.isBackstackSkipped = true;
            newControllers.removeLastObject();
            newControllers.addObject(viewController);
            this._ios.controller.setViewControllersAnimated(newControllers, animated);
            if (frame_common_1.traceEnabled()) {
                frame_common_1.traceWrite(this + ".setViewControllersAnimated([originalControllers - lastController + " + viewController + "], " + animated + "); depth = " + navDepth, frame_common_1.traceCategories.Navigation);
            }
            return;
        }
        this._ios.controller.pushViewControllerAnimated(viewController, animated);
        if (frame_common_1.traceEnabled()) {
            frame_common_1.traceWrite(this + ".pushViewControllerAnimated(" + viewController + ", " + animated + "); depth = " + navDepth, frame_common_1.traceCategories.Navigation);
        }
    };
    Frame.prototype._goBackCore = function (backstackEntry) {
        _super.prototype._goBackCore.call(this, backstackEntry);
        navDepth = backstackEntry[NAV_DEPTH];
        if (!this._shouldSkipNativePop) {
            var controller = backstackEntry.resolvedPage.ios;
            var animated = this._currentEntry ? this._getIsAnimatedNavigation(this._currentEntry.entry) : false;
            this._updateActionBar(backstackEntry.resolvedPage);
            if (frame_common_1.traceEnabled()) {
                frame_common_1.traceWrite(this + ".popToViewControllerAnimated(" + controller + ", " + animated + "); depth = " + navDepth, frame_common_1.traceCategories.Navigation);
            }
            this._ios.controller.popToViewControllerAnimated(controller, animated);
        }
    };
    Frame.prototype._updateActionBar = function (page, disableNavBarAnimation) {
        if (disableNavBarAnimation === void 0) { disableNavBarAnimation = false; }
        _super.prototype._updateActionBar.call(this, page);
        if (page && this.currentPage && this.currentPage.modal === page) {
            return;
        }
        page = page || this.currentPage;
        var newValue = this._getNavBarVisible(page);
        var disableNavBarAnimationCache = this._ios._disableNavBarAnimation;
        if (disableNavBarAnimation) {
            this._ios._disableNavBarAnimation = true;
        }
        this._ios.showNavigationBar = newValue;
        if (disableNavBarAnimation) {
            this._ios._disableNavBarAnimation = disableNavBarAnimationCache;
        }
        if (this._ios.controller.navigationBar) {
            this._ios.controller.navigationBar.userInteractionEnabled = this.navigationQueueIsEmpty();
        }
    };
    Frame.prototype._getNavBarVisible = function (page) {
        switch (this._ios.navBarVisibility) {
            case "always":
                return true;
            case "never":
                return false;
            case "auto":
                var newValue = void 0;
                if (page && page.actionBarHidden !== undefined) {
                    newValue = !page.actionBarHidden;
                }
                else {
                    newValue = this.ios.controller.viewControllers.count > 1 || (page && page.actionBar && !page.actionBar._isEmpty());
                }
                newValue = !!newValue;
                return newValue;
        }
    };
    Object.defineProperty(Frame.prototype, "ios", {
        get: function () {
            return this._ios;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Frame, "defaultAnimatedNavigation", {
        get: function () {
            return frame_common_1.FrameBase.defaultAnimatedNavigation;
        },
        set: function (value) {
            frame_common_1.FrameBase.defaultAnimatedNavigation = value;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Frame, "defaultTransition", {
        get: function () {
            return frame_common_1.FrameBase.defaultTransition;
        },
        set: function (value) {
            frame_common_1.FrameBase.defaultTransition = value;
        },
        enumerable: true,
        configurable: true
    });
    Frame.prototype.requestLayout = function () {
        _super.prototype.requestLayout.call(this);
        var window = this.nativeViewProtected.window;
        if (window) {
            window.setNeedsLayout();
        }
    };
    Frame.prototype.onMeasure = function (widthMeasureSpec, heightMeasureSpec) {
        var width = frame_common_1.layout.getMeasureSpecSize(widthMeasureSpec);
        var widthMode = frame_common_1.layout.getMeasureSpecMode(widthMeasureSpec);
        var height = frame_common_1.layout.getMeasureSpecSize(heightMeasureSpec);
        var heightMode = frame_common_1.layout.getMeasureSpecMode(heightMeasureSpec);
        this._widthMeasureSpec = widthMeasureSpec;
        this._heightMeasureSpec = heightMeasureSpec;
        var result = this.measurePage(this.currentPage);
        if (this._navigateToEntry && this.currentPage) {
            var newPageSize = this.measurePage(this._navigateToEntry.resolvedPage);
            result.measuredWidth = Math.max(result.measuredWidth, newPageSize.measuredWidth);
            result.measuredHeight = Math.max(result.measuredHeight, newPageSize.measuredHeight);
        }
        var widthAndState = frame_common_1.View.resolveSizeAndState(result.measuredWidth, width, widthMode, 0);
        var heightAndState = frame_common_1.View.resolveSizeAndState(result.measuredHeight, height, heightMode, 0);
        this.setMeasuredDimension(widthAndState, heightAndState);
    };
    Frame.prototype.measurePage = function (page) {
        var heightSpec = this._heightMeasureSpec;
        if (page && !page.backgroundSpanUnderStatusBar && !this.parent) {
            var height = frame_common_1.layout.getMeasureSpecSize(this._heightMeasureSpec);
            var heightMode = frame_common_1.layout.getMeasureSpecMode(this._heightMeasureSpec);
            var statusBarHeight = uiUtils.ios.getStatusBarHeight();
            heightSpec = frame_common_1.layout.makeMeasureSpec(height - statusBarHeight, heightMode);
        }
        return frame_common_1.View.measureChild(this, page, this._widthMeasureSpec, heightSpec);
    };
    Frame.prototype.onLayout = function (left, top, right, bottom) {
        this._right = right;
        this._bottom = bottom;
        this._handleHigherInCallStatusBarIfNeeded();
        this.layoutPage(this.currentPage);
        if (this._navigateToEntry && this.currentPage) {
            this.layoutPage(this._navigateToEntry.resolvedPage);
        }
    };
    Frame.prototype.layoutPage = function (page) {
        if (page && page._viewWillDisappear) {
            return;
        }
        var statusBarHeight = (page && !page.backgroundSpanUnderStatusBar && !this.parent) ? uiUtils.ios.getStatusBarHeight() : 0;
        if (this._ios.showNavigationBar &&
            !this._ios.controller.navigationBar.translucent &&
            page && page._ios && !page._ios.shown) {
            statusBarHeight = 0;
        }
        frame_common_1.View.layoutChild(this, page, 0, statusBarHeight, this._right, this._bottom);
    };
    Object.defineProperty(Frame.prototype, "navigationBarHeight", {
        get: function () {
            var navigationBar = this._ios.controller.navigationBar;
            return (navigationBar && !this._ios.controller.navigationBarHidden) ? navigationBar.frame.size.height : 0;
        },
        enumerable: true,
        configurable: true
    });
    Frame.prototype._setNativeViewFrame = function (nativeView, frame) {
        if (nativeView.frame.size.width === frame.size.width && nativeView.frame.size.height === frame.size.height) {
            return;
        }
        _super.prototype._setNativeViewFrame.call(this, nativeView, frame);
    };
    Frame.prototype.remeasureFrame = function () {
        this.requestLayout();
        var window = this.nativeViewProtected.window;
        if (window) {
            window.layoutIfNeeded();
        }
    };
    Frame.prototype._onNavigatingTo = function (backstackEntry, isBack) {
    };
    Frame.prototype._handleHigherInCallStatusBarIfNeeded = function () {
        var statusBarHeight = uiUtils.ios.getStatusBarHeight();
        if (!this._ios ||
            !this._ios.controller ||
            !this._ios.controller.navigationBar ||
            this._ios.controller.navigationBar.hidden ||
            utils.layout.toDevicePixels(this._ios.controller.navigationBar.frame.origin.y) === statusBarHeight) {
            return;
        }
        if (frame_common_1.traceEnabled()) {
            frame_common_1.traceWrite("Forcing navigationBar.frame.origin.y to " + statusBarHeight + " due to a higher in-call status-bar", frame_common_1.traceCategories.Layout);
        }
        this._ios.controller.navigationBar.autoresizingMask = 0;
        this._ios.controller.navigationBar.removeConstraints(this._ios.controller.navigationBar.constraints);
        this._ios.controller.navigationBar.frame = CGRectMake(this._ios.controller.navigationBar.frame.origin.x, utils.layout.toDeviceIndependentPixels(statusBarHeight), this._ios.controller.navigationBar.frame.size.width, this._ios.controller.navigationBar.frame.size.height);
    };
    __decorate([
        profiling_1.profile
    ], Frame.prototype, "onLoaded", null);
    __decorate([
        profiling_1.profile
    ], Frame.prototype, "_navigateCore", null);
    return Frame;
}(frame_common_1.FrameBase));
exports.Frame = Frame;
var transitionDelegates = new Array();
var TransitionDelegate = (function (_super) {
    __extends(TransitionDelegate, _super);
    function TransitionDelegate() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    TransitionDelegate.initWithOwnerId = function (id) {
        var delegate = TransitionDelegate.new();
        delegate._id = id;
        transitionDelegates.push(delegate);
        return delegate;
    };
    TransitionDelegate.prototype.animationWillStart = function (animationID, context) {
        if (frame_common_1.traceEnabled()) {
            frame_common_1.traceWrite("START " + this._id, frame_common_1.traceCategories.Transition);
        }
    };
    TransitionDelegate.prototype.animationDidStop = function (animationID, finished, context) {
        if (finished) {
            if (frame_common_1.traceEnabled()) {
                frame_common_1.traceWrite("END " + this._id, frame_common_1.traceCategories.Transition);
            }
        }
        else {
            if (frame_common_1.traceEnabled()) {
                frame_common_1.traceWrite("CANCEL " + this._id, frame_common_1.traceCategories.Transition);
            }
        }
        var index = transitionDelegates.indexOf(this);
        if (index > -1) {
            transitionDelegates.splice(index, 1);
        }
    };
    TransitionDelegate.ObjCExposedMethods = {
        "animationWillStart": { returns: interop.types.void, params: [NSString, NSObject] },
        "animationDidStop": { returns: interop.types.void, params: [NSString, NSNumber, NSObject] }
    };
    return TransitionDelegate;
}(NSObject));
var _defaultTransitionDuration = 0.35;
var UINavigationControllerAnimatedDelegate = (function (_super) {
    __extends(UINavigationControllerAnimatedDelegate, _super);
    function UINavigationControllerAnimatedDelegate() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    UINavigationControllerAnimatedDelegate.prototype.navigationControllerAnimationControllerForOperationFromViewControllerToViewController = function (navigationController, operation, fromVC, toVC) {
        var viewController;
        switch (operation) {
            case 1:
                viewController = toVC;
                break;
            case 2:
                viewController = fromVC;
                break;
        }
        if (!viewController) {
            return null;
        }
        var navigationTransition = viewController[TRANSITION];
        if (!navigationTransition) {
            return null;
        }
        if (frame_common_1.traceEnabled()) {
            frame_common_1.traceWrite("UINavigationControllerImpl.navigationControllerAnimationControllerForOperationFromViewControllerToViewController(" + operation + ", " + fromVC + ", " + toVC + "), transition: " + JSON.stringify(navigationTransition), frame_common_1.traceCategories.NativeLifecycle);
        }
        var curve = _getNativeCurve(navigationTransition);
        var animationController = fragment_transitions_1._createIOSAnimatedTransitioning(navigationTransition, curve, operation, fromVC, toVC);
        return animationController;
    };
    UINavigationControllerAnimatedDelegate.ObjCProtocols = [UINavigationControllerDelegate];
    return UINavigationControllerAnimatedDelegate;
}(NSObject));
var UINavigationControllerImpl = (function (_super) {
    __extends(UINavigationControllerImpl, _super);
    function UINavigationControllerImpl() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    UINavigationControllerImpl.initWithOwner = function (owner) {
        var controller = UINavigationControllerImpl.new();
        controller._owner = owner;
        return controller;
    };
    Object.defineProperty(UINavigationControllerImpl.prototype, "owner", {
        get: function () {
            return this._owner.get();
        },
        enumerable: true,
        configurable: true
    });
    UINavigationControllerImpl.prototype.viewWillAppear = function (animated) {
        _super.prototype.viewWillAppear.call(this, animated);
        var owner = this._owner.get();
        if (owner && (!owner.isLoaded && !owner.parent)) {
            owner.onLoaded();
        }
    };
    UINavigationControllerImpl.prototype.viewDidLayoutSubviews = function () {
        var owner = this._owner.get();
        if (owner) {
            if (frame_common_1.traceEnabled()) {
                frame_common_1.traceWrite(this._owner + " viewDidLayoutSubviews, isLoaded = " + owner.isLoaded, frame_common_1.traceCategories.ViewHierarchy);
            }
            owner._updateLayout();
        }
    };
    UINavigationControllerImpl.prototype.animateWithDuration = function (navigationTransition, nativeTransition, transitionType, baseCallback) {
        var _this = this;
        var duration = navigationTransition.duration ? navigationTransition.duration / 1000 : _defaultTransitionDuration;
        var curve = _getNativeCurve(navigationTransition);
        var transitionTraced = frame_common_1.isCategorySet(frame_common_1.traceCategories.Transition);
        var transitionDelegate;
        if (transitionTraced) {
            var id = _getTransitionId(nativeTransition, transitionType);
            transitionDelegate = TransitionDelegate.initWithOwnerId(id);
        }
        UIView.animateWithDurationAnimations(duration, function () {
            if (transitionTraced) {
                UIView.setAnimationDelegate(transitionDelegate);
            }
            UIView.setAnimationWillStartSelector("animationWillStart");
            UIView.setAnimationDidStopSelector("animationDidStop");
            UIView.setAnimationCurve(curve);
            baseCallback();
            UIView.setAnimationTransitionForViewCache(nativeTransition, _this.view, true);
        });
    };
    UINavigationControllerImpl.prototype.pushViewControllerAnimated = function (viewController, animated) {
        var _this = this;
        var navigationTransition = viewController[TRANSITION];
        if (frame_common_1.traceEnabled()) {
            frame_common_1.traceWrite("UINavigationControllerImpl.pushViewControllerAnimated(" + viewController + ", " + animated + "); transition: " + JSON.stringify(navigationTransition), frame_common_1.traceCategories.NativeLifecycle);
        }
        var nativeTransition = _getNativeTransition(navigationTransition, true);
        if (!animated || !navigationTransition || !nativeTransition) {
            _super.prototype.pushViewControllerAnimated.call(this, viewController, animated);
            return;
        }
        this.animateWithDuration(navigationTransition, nativeTransition, "push", function () {
            _super.prototype.pushViewControllerAnimated.call(_this, viewController, false);
        });
    };
    UINavigationControllerImpl.prototype.setViewControllersAnimated = function (viewControllers, animated) {
        var _this = this;
        var viewController = viewControllers.lastObject;
        var navigationTransition = viewController[TRANSITION];
        if (frame_common_1.traceEnabled()) {
            frame_common_1.traceWrite("UINavigationControllerImpl.setViewControllersAnimated(" + viewControllers + ", " + animated + "); transition: " + JSON.stringify(navigationTransition), frame_common_1.traceCategories.NativeLifecycle);
        }
        var nativeTransition = _getNativeTransition(navigationTransition, true);
        if (!animated || !navigationTransition || !nativeTransition) {
            _super.prototype.setViewControllersAnimated.call(this, viewControllers, animated);
            return;
        }
        this.animateWithDuration(navigationTransition, nativeTransition, "set", function () {
            _super.prototype.setViewControllersAnimated.call(_this, viewControllers, false);
        });
    };
    UINavigationControllerImpl.prototype.popViewControllerAnimated = function (animated) {
        var _this = this;
        var lastViewController = this.viewControllers.lastObject;
        var navigationTransition = lastViewController[TRANSITION];
        if (frame_common_1.traceEnabled()) {
            frame_common_1.traceWrite("UINavigationControllerImpl.popViewControllerAnimated(" + animated + "); transition: " + JSON.stringify(navigationTransition), frame_common_1.traceCategories.NativeLifecycle);
        }
        if (navigationTransition && navigationTransition.name === "non-animated") {
            return _super.prototype.popViewControllerAnimated.call(this, false);
        }
        var nativeTransition = _getNativeTransition(navigationTransition, false);
        if (!animated || !navigationTransition || !nativeTransition) {
            return _super.prototype.popViewControllerAnimated.call(this, animated);
        }
        this.animateWithDuration(navigationTransition, nativeTransition, "pop", function () {
            _super.prototype.popViewControllerAnimated.call(_this, false);
        });
        return null;
    };
    UINavigationControllerImpl.prototype.popToViewControllerAnimated = function (viewController, animated) {
        var _this = this;
        var lastViewController = this.viewControllers.lastObject;
        var navigationTransition = lastViewController[TRANSITION];
        if (frame_common_1.traceEnabled()) {
            frame_common_1.traceWrite("UINavigationControllerImpl.popToViewControllerAnimated(" + viewController + ", " + animated + "); transition: " + JSON.stringify(navigationTransition), frame_common_1.traceCategories.NativeLifecycle);
        }
        if (navigationTransition && navigationTransition.name === "non-animated") {
            return _super.prototype.popToViewControllerAnimated.call(this, viewController, false);
        }
        var nativeTransition = _getNativeTransition(navigationTransition, false);
        if (!animated || !navigationTransition || !nativeTransition) {
            return _super.prototype.popToViewControllerAnimated.call(this, viewController, animated);
        }
        this.animateWithDuration(navigationTransition, nativeTransition, "popTo", function () {
            _super.prototype.popToViewControllerAnimated.call(_this, viewController, false);
        });
        return null;
    };
    __decorate([
        profiling_1.profile
    ], UINavigationControllerImpl.prototype, "viewWillAppear", null);
    return UINavigationControllerImpl;
}(UINavigationController));
function _getTransitionId(nativeTransition, transitionType) {
    var name;
    switch (nativeTransition) {
        case 4:
            name = "CurlDown";
            break;
        case 3:
            name = "CurlUp";
            break;
        case 1:
            name = "FlipFromLeft";
            break;
        case 2:
            name = "FlipFromRight";
            break;
        case 0:
            name = "None";
            break;
    }
    return name + " " + transitionType;
}
function _getNativeTransition(navigationTransition, push) {
    if (navigationTransition && navigationTransition.name) {
        switch (navigationTransition.name.toLowerCase()) {
            case "flip":
            case "flipright":
                return push ? 2 : 1;
            case "flipleft":
                return push ? 1 : 2;
            case "curl":
            case "curlup":
                return push ? 3 : 4;
            case "curldown":
                return push ? 4 : 3;
        }
    }
    return null;
}
function _getNativeCurve(transition) {
    if (transition.curve) {
        switch (transition.curve) {
            case "easeIn":
                if (frame_common_1.traceEnabled()) {
                    frame_common_1.traceWrite("Transition curve resolved to UIViewAnimationCurve.EaseIn.", frame_common_1.traceCategories.Transition);
                }
                return 1;
            case "easeOut":
                if (frame_common_1.traceEnabled()) {
                    frame_common_1.traceWrite("Transition curve resolved to UIViewAnimationCurve.EaseOut.", frame_common_1.traceCategories.Transition);
                }
                return 2;
            case "easeInOut":
                if (frame_common_1.traceEnabled()) {
                    frame_common_1.traceWrite("Transition curve resolved to UIViewAnimationCurve.EaseInOut.", frame_common_1.traceCategories.Transition);
                }
                return 0;
            case "linear":
                if (frame_common_1.traceEnabled()) {
                    frame_common_1.traceWrite("Transition curve resolved to UIViewAnimationCurve.Linear.", frame_common_1.traceCategories.Transition);
                }
                return 3;
            default:
                if (frame_common_1.traceEnabled()) {
                    frame_common_1.traceWrite("Transition curve resolved to original: " + transition.curve, frame_common_1.traceCategories.Transition);
                }
                return transition.curve;
        }
    }
    return 0;
}
exports._getNativeCurve = _getNativeCurve;
var iOSFrame = (function () {
    function iOSFrame(frame) {
        this._navBarVisibility = "auto";
        this._frame = frame;
        this._controller = UINavigationControllerImpl.initWithOwner(new WeakRef(frame));
        this._controller.automaticallyAdjustsScrollViewInsets = false;
    }
    Object.defineProperty(iOSFrame.prototype, "controller", {
        get: function () {
            return this._controller;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(iOSFrame.prototype, "showNavigationBar", {
        get: function () {
            return this._showNavigationBar;
        },
        set: function (value) {
            var change = this._showNavigationBar !== value;
            this._showNavigationBar = value;
            var animated = !this._frame._isInitialNavigation && !this._disableNavBarAnimation;
            this._controller.setNavigationBarHiddenAnimated(!value, animated);
            var currentPage = this._controller.owner.currentPage;
            if (currentPage && change) {
                currentPage.requestLayout();
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(iOSFrame.prototype, "navBarVisibility", {
        get: function () {
            return this._navBarVisibility;
        },
        set: function (value) {
            this._navBarVisibility = value;
        },
        enumerable: true,
        configurable: true
    });
    return iOSFrame;
}());
//# sourceMappingURL=frame.js.map