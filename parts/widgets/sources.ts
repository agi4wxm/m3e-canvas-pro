/* The components this project draws itself, beside the shadcn M3E ones, and the file each is in. Plain
 * data: the definitions name these components without loading React. */

const FILES: Record<string, string[]> = {
  Rating: ["Rating"],
  FieldFrame: ["FieldFrame"],
  ColorField: ["ColorField"],
  ClipboardRow: ["ClipboardRow"],
  Joystick: ["Joystick"],
  QuantityStepper: ["QuantityStepper"],
  Draws: ["Wheel", "GridWheel", "Gacha", "SlotMachine", "MoneyTree", "EggSmash"],
  Panels: ["Inventory", "ItemCell", "TaskBar", "RewardTrack", "CheckIn", "FunctionButton"],
  Inputs: ["TagInput", "FileUpload", "ItemPicker", "MultiSelect", "ColorPalette", "NumberPicker"],
  Content: ["CodeBlock", "Markdown", "SortableList"],
  Motion: ["NumberTicker", "Marquee", "Timer", "PullToRefresh", "SlideGroup", "SwipeRow", "AudioPlayer"],
  AppParts: ["ProductCard", "CartList", "Coupon", "CheckoutBar", "BalanceCard", "TransactionList", "RouteCard", "ProfileHeader", "PostCard", "ConversationList", "ContactList", "CommentList", "StoryRow", "NotificationList", "FileList", "SettingsGroup", "Playlist", "Leaderboard", "BarList", "Sparkline", "IconGrid", "Banner", "NoticeBar"],
  AppTools: ["DataTable", "Kanban", "Agenda", "TodoList", "TransferList", "AuthForm", "NumberPad", "SignaturePad", "RichTextEditor", "ChatComposer", "Onboarding", "QrCode"],
  AppMore: ["ImageViewer", "ImageCropper", "RegionPicker", "SeatMap", "ReviewSummary", "FunnelChart", "GanttChart", "VoiceMessage", "VideoCall"],
  GameParts: ["SkillButton", "LevelMap", "DialogueBox", "GameBoard"],
  Scene: ["Scene"],
  Platform: ["MapView", "CameraView"],
  Split: ["SplitView"],
};

/** where printed code imports each widget from */
export const WIDGET_SOURCES: Record<string, string> = Object.fromEntries(Object.entries(FILES).flatMap(([file, names]) => names.map((name) => [name, `@/components/widgets/${file}`])));
