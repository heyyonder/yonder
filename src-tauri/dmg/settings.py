# The settings of dmgbuild for the DMG of Yonder. release.ts runs `uvx dmgbuild -s settings.py -D app=<Yonder.app>`
# in this folder, so the paths here are relative to it. dmgbuild writes the .DS_Store of the window itself, so it
# needs no Finder.
import os.path

app = defines["app"]  # noqa: F821, dmgbuild defines defines

files = [app]
symlinks = {"Applications": "/Applications"}
format = "UDZO"
filesystem = "HFS+"
icon = "../icons/icon.icns"

# dmgbuild finds background@2x.png and joins the two into one TIFF for Retina screens.
background = "background.png"
window_rect = ((200, 120), (660, 380))
default_view = "icon-view"
show_status_bar = False
show_toolbar = False
show_sidebar = False
show_pathbar = False
icon_size = 128
text_size = 13
# The places match the empty space in background.svg.
icon_locations = {
    os.path.basename(app): (170, 200),
    "Applications": (490, 200),
    # The hidden files go in the free top corners. Without a place, Finder puts them in a row under the window
    # when it shows hidden files, and the window then scrolls. dmgbuild names the joined background .background.tiff.
    ".background.tiff": (64, 90),
    ".VolumeIcon.icns": (596, 90),
}
