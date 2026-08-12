# Change Log

All notable changes to the "CodePDF Exporter" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.


## [0.0.4] - 2026-08-13
### Added
- UTF-8 / Unicode support — characters like `ñ`, `á`, `ü`, `ß` now render correctly using embedded Noto Sans Mono font
- Decimal font size support — slider now supports 0.5 step increments
- Editable font size input — type exact values directly next to the slider

### Fixed
- Non-ASCII characters were being stripped and replaced with spaces

## [0.0.3] - 2026-04-10
### Changed
- Improved page margins and layout

## [0.0.1] - 2026-04-11

- Initial release
- Whole project and selective file export
- Configurable font family and size (8-20px)
- New page per file toggle
- Line numbers with vertical separator
- Automatic line wrapping for long lines
- Smart file detection (skips binaries, configs, build artifacts)