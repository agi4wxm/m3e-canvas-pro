/* The Taro kit M3E Canvas exports a design's mini-program with (WeChat, Douyin, H5): one component per part the editor
 * has (or a tree of atoms, or a placeholder), the theme they read (CSS variables, see theme.ts), what a printed screen
 * stands on, and the runtime its taps run on. See docs/小程序.md. */

export { Box, Cell, Container, Icon, Image, Separator, Shape, Spacer, Svg, Text, heldLayout, type BoxProps, type PartBase, type TextProps } from "./atoms/basics";
export { Button, Checkbox, Chip, IconButton, Input, Label, Link, Radio, Rating, Slider, Switch, Textarea, Toggle, buttonColors, type ButtonProps } from "./atoms/controls";
export { Avatar, Badge, CircularProgress, Dot, Kbd, LoadingIndicator, PageDots, Progress, Skeleton, Spinner, TypingIndicator } from "./atoms/indicators";
export { Words } from "./atoms/words";
export { AppBar, Fab, MiniProgramHeader, NavigationBar, Search, Tabs, tapOf } from "./composites/bars";
export { Alert, Card, ListItem, Snackbar } from "./composites/content";
export { DatePicker, FileUpload, Menu, RadioGroup, SegmentedButton, Select, TextField, TimePicker, pickFiles, type PickedFile } from "./composites/forms";
export { ActionSheet, AlertDialog, Dialog, Sheet } from "./composites/overlays";
export { Placeholder } from "./Placeholder";
export { SplitView, type SplitViewProps } from "./split";
export { At, Layer, Pin, Screen, ThemeRoot, chrome, useChrome, type Chrome } from "./screen";
export { Glyph, base64, glyphFor, hasGlyph, registerIcons, svgUrl, type IconData } from "./icons";
export { Surface, tagOf } from "./Surface";
export { UNMAPPED, paint, type Appearance, type Corners, type Look } from "./look";
export { c, ca, css, inkVars, st } from "./color";
export { ThemeProvider, Ink, hexAlpha, resolveRef, themeClass, typeStyle, useKit, useSystemDark, type Kit, type KitTheme, type ThemeMode, type TypeStep } from "./theme";
export { MATERIAL } from "./theme.generated";
export { INPUT_PROPS, NATIVE, isNative, kitPropName } from "./coverage";
export { COMPONENTS } from "./registry";
export { PARTS, type PartInfo } from "./parts.generated";
export { sx, merge, type CSS } from "./styles";
export { useValue } from "./value";
export { AppSpecProvider, useAppSpec, usePageData, useScreen, type Env, type ScreenHandle, type ScreenInit } from "./app/screen";
export { currentPlace, goBack, loginScreen, openPlace, readQuery, urlOf, type Place } from "./app/nav";
export { initVars, readVar, writeVar } from "./app/vars";
export { optionIndex, rowsOf } from "./app/values";
export { KIT_ICONS } from "./iconNames";
export { createTaroTransport, queryString, readAsDataUrl, taroStorage, withFileData, type PlatformFile, type TaroTransportOptions } from "./app/transport";
export type { Action, ActionBody, AppSpec, CallFn, Condition, Effect, ScreenSpec, VarSpec } from "./app/spec";
/* D3: pickers and entry parts */
export { Calendar, ColorField, ColorPalette, Combobox, ItemPicker, MultiSelect, NativeSelect, NumberPicker, RegionPicker, SeatMap, TransferList, WheelPicker, daysOf, hexOf, keysOf, levelsOf, pickDay, placesOf, seatsOf, toggleSeat, useEntry, weeksOf, wordsOfPlaces, type TableData } from "./composites/pickers";
export { CopyRow, Field, Form, InputGroup, InputOtp, MARKS, NumberPad, PhoneInput, QuantityStepper, RichTextEditor, SignaturePad, TagInput, markNext, padNext, padReady, tagsOf } from "./composites/entry";
/* D4: the game parts, and a group of buttons, actions, menus and search */
export { BrandButton, ButtonGroup, CascadingMenu, Command, ContextMenu, FabMenu, FilterBar, SHEET_ROWS, SplitButton, brandCapability, brandLook, brandWords, cascadeSheet, commandMatches, toggled, type BrandButtonProps, type ButtonGroupProps, type CascadingMenuProps, type CommandProps, type ContextMenuProps, type FabMenuProps, type FilterBarProps, type SplitButtonProps } from "./composites/actions";
export { DRAW_START, EggSmash, Gacha, GameBoard, GridDraw, Joystick, LevelMap, MoneyTree, PrizeWheel, SPIN_MS, SkillButton, SlotMachine, angleOf, boardOf, boardStatus, cooldownLeft, drawAnswer, drawBusy, drawPress, drawRun, drawShown, fromAngle, givenOf, levelAt, litOf, pickedOf, pushOf, reelAt, reelsOf, restingOf, starsOf, vecOf, wheelStops, wheelTurn, wordsOfVec, type DrawProps, type DrawState, type GameBoardProps, type JoystickProps, type LevelMapProps, type SkillButtonProps, type SlotMachineProps, type Vec } from "./composites/games";
/* D5: layouts, ways of getting around, what floats */
export { Accordion, AspectRatio, Collapsible, CustomComponent, Dock, DockPane, GridView, ScrollArea, Stack, SupportingPane, gridRowHeight, onPane, ratioOf, toggledOpen, useDraft, type DockProps, type GridViewProps } from "./composites/layouts";
export { FloatingNav, IconGrid, NavigationMenu, NavigationRail, Onboarding, Pagination, Sidebar, SlideGroup, TableOfContents, pagesShown, railWidths, tocRow, type OnboardingProps } from "./composites/navs";
export { Drawer, HoverCard, Popover, SideSheet, Tooltip, around, placeOf } from "./composites/floating";
/* D1: media, capability views' stand-ins, what talks and keeps time */
export { Animation, AudioPlayer, CameraStandIn, Carousel, ExpressiveCarousel, ImageCropper, ImageViewer, MapStandIn, Marquee, PhotoGrid, Playlist, QrCode, Scene, Video, WebPage, qrMatrix, type MapStandInProps } from "./composites/media";
export { CallStandIn, Marker, MessageScroller, NumberTicker, Questionnaire, ShimmerText, StoryRow, Timer, VoiceMessage, timerSeconds } from "./composites/live";
