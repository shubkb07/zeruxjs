- Add CSS Sprite timeline view funtionality, where we get a json on with Video source that will be {
    "frames": {
        timestamp: { // timestamp is time in seconds
            "src": "", // source of image
            "x": 0, "y": 0, "w": 160, "h": 90 // width and height of the frame in the sprite
        }
    }
}

- Multiple Quality support, And auto quality switching based on bandwidth.
- Add encrypted video and data support,
- Add chunked video support,
- Also both together too,
- Add playlist support, where if one format is not supported by the browser or device, it will try to play the next format in the playlist.
- Also add next and previous button to the playlist, when there is more than one video in the playlist.
- volume boost, make gain 2,
- Autoplay for playlist, to play next video in the playlist automatically.
- PIP, Theater Mode, and Full Screen mode button.
- Cast button to cast the video to a Chromecast device.
- Have CROS protection/Handling and All case handling like http range not supported or other issues, and must not have console error, better error handling.
- Add Subtitle/CC for multiple language support, also support moving subtitle position on video, if controls cove then cc move up or down, so controls never cover the subtitle.
- Add speed control slider for more control over speed from 0.25 to 4x.
- Section Support, like youtube chapters, where we can add sections to the video, and when the video reaches that section, it will show the title of that section.
-Add all keyboard shortcut control for player:
  General
  - Mute/Unmute: M
  - Volume Up: Up Arrow
  - Volume Down: Down Arrow
  - Toggle full screen: F
  - Toggle theater mode: T
  - Toggle miniplayer: I
  - Close miniplayer or current dialog: ESCAPE
  - Toggle mute: M

  Playback
  - Play/Pause: Space or K
  - Seek Forward: Right Arrow
  - Seek Backward: Left Arrow
  - Rewind: j
  - Forward: l
  - Previous frame (while paused): , 
  - Next frame (while paused): .
  - Decrease playback rate: < (SHIFT+,)
  - Increase playback rate: > (SHIFT+,)
  - Seek to specific point in the video (7 advances to 70% of duration): 0-9
  - Seek to previous chapter: CONTROL + ←
  - Seek to next chapter: CONTROL + →
  - Jump ahead (over commonly skipped sections): CONTROL + →

  Subtitles and closed captions
  - If the video supports captions, toggle captions ON/OFF: c
  - Rotate through different text opacity levels: o
  - Rotate through different window opacity levels: w
  - Rotate through font sizes (increasing): +
  - Rotate through font sizes (decreasing): -

  Spherical Videos
  - Pan up: w
  - Pan left: a
  - Pan down: s
  - Pan right: d
  - Zoom in: + on numpad or ]
  - Zoom out: - on numpad or [


Now Design Making prerequisites
- Disign Should be No mobile or Desktop first as player is fully genrated by JS,
- at time of load check navigator.userAgentData.mobile and genrate player as it,
- all set setInterval to check navigator.userAgentData.mobile every 2 second, so if its true or false then change player design accordingly without desturbing video tag itself
- Make design fully youtube player like

Desktop:
Below timeline contols

on left
first Backword, Playpause, Forward buttons, where backword and Forward buttons only if its playlist and have more than 1 video in playlist, and also based on if its first or past video
second Volume control
timeStamp (clicking toggle between current / total time and - remaining time / total time)

on right
autoplay
CC
Settings (Volume Boost(toggle), Subtitle (sub menu, on top have options, that is nexted submenu have style customization), sleep timer (submenu, off, {multiple of 10 and 15 till 60m}, end of video), playback speed (submenu with slider and default options too), quality (submenu))
Theater Mode
PIP
Cast
Fullscreen button

mouse Right click in video have custom menu with options (Loop, Miniplayer, Copy Video Url, Copy Video URL with current time, copy embed url, copy debug info, stat for nerds)


Mobile:
timeline will be below
on above timeline
on left,
timestamp
section name clickable, clicking it will open playlist like area to show section direclty, it will also take screenshot of section start via chunk request for that second and show on hover if css sprite not present,

on right
full screen


on top right
autoplay
cc
settings (quality, speed, captions, copy debug info, stat for nerds)

on center of player (for mobile only, not on desktop)
first Backword, Playpause, Forward buttons, where backword and Forward buttons only if its playlist and have more than 1 video in playlist, and also based on if its first or past video


in settings user have an option to switch to desktop player on mobile navigator and vica versa too