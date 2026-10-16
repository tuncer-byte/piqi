import AppKit

/// Ekranların notch geometrisini döndürür. Electron bu bilgiyi sağlamadığı için Island konumlandırması buradan beslenir.
enum Screens {
    static func describe() -> [[String: Any]] {
        NSScreen.screens.map { screen in
            let frame = screen.frame
            let visible = screen.visibleFrame
            var item: [String: Any] = [
                "width": frame.width,
                "height": frame.height,
                "x": frame.origin.x,
                "y": frame.origin.y,
                "menuBarHeight": frame.maxY - visible.maxY,
                "isMain": screen == NSScreen.main,
            ]
            if screen.safeAreaInsets.top > 0,
               let left = screen.auxiliaryTopLeftArea,
               let right = screen.auxiliaryTopRightArea {
                item["notch"] = [
                    "width": right.minX - left.maxX,
                    "height": screen.safeAreaInsets.top,
                ]
            }
            return item
        }
    }
}
