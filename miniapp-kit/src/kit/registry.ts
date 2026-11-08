import type { ComponentType } from "react";

import { Box, Container, Icon, Image, Separator, Shape, Spacer, Svg, Text } from "./atoms/basics";
import { Button, Checkbox, Chip, IconButton, Input, Label, Link, Radio, Rating, Slider, Switch, Textarea, Toggle } from "./atoms/controls";
import { Avatar, Badge, CircularProgress, Dot, Kbd, LoadingIndicator, PageDots, Progress, Skeleton, Spinner, TypingIndicator } from "./atoms/indicators";
import { AppBar, Fab, MiniProgramHeader, NavigationBar, Search, Tabs } from "./composites/bars";
import { Alert, Card, ListItem, Snackbar } from "./composites/content";
import { DatePicker, FileUpload, Menu, RadioGroup, SegmentedButton, Select, TextField, TimePicker } from "./composites/forms";
import { ActionSheet, AlertDialog, Dialog, Sheet } from "./composites/overlays";
import { NATIVE, type NativeName, type NativeSlug } from "./coverage";
import { SplitView } from "./split";
/* D1: media, capability views' stand-ins, what talks and keeps time */
import { CallStandIn, Marker, MessageScroller, NumberTicker, Questionnaire, ShimmerText, StoryRow, Timer, VoiceMessage } from "./composites/live";
import { Animation, AudioPlayer, CameraStandIn, Carousel, ExpressiveCarousel, ImageCropper, ImageViewer, MapStandIn, Marquee, PhotoGrid, Playlist, QrCode, Scene, Video, WebPage } from "./composites/media";

/* Every component the kit draws a part with, by the name coverage.ts gives it, and by the part's id. */

export const BY_NAME = {
  Box,
  Container,
  SplitView,
  Text,
  Icon,
  Svg,
  Image,
  Separator,
  Spacer,
  Shape,
  Button,
  IconButton,
  Toggle,
  Chip,
  Switch,
  Checkbox,
  Radio,
  Slider,
  Input,
  Textarea,
  Label,
  Link,
  Rating,
  Badge,
  Avatar,
  Progress,
  CircularProgress,
  Spinner,
  Dot,
  Skeleton,
  Kbd,
  PageDots,
  LoadingIndicator,
  TypingIndicator,
  AppBar,
  MiniProgramHeader,
  NavigationBar,
  ListItem,
  Card,
  TextField,
  Search,
  Tabs,
  Dialog,
  AlertDialog,
  Sheet,
  ActionSheet,
  Snackbar,
  Fab,
  SegmentedButton,
  Menu,
  Select,
  DatePicker,
  TimePicker,
  Alert,
  RadioGroup,
  FileUpload,
  /* D1: media, capability views' stand-ins, what talks and keeps time */
  Carousel,
  ExpressiveCarousel,
  Video,
  WebPage,
  Animation,
  CameraStandIn,
  MapStandIn,
  PhotoGrid,
  AudioPlayer,
  Marquee,
  Playlist,
  QrCode,
  Scene,
  ImageViewer,
  ImageCropper,
  StoryRow,
  VoiceMessage,
  CallStandIn,
  Marker,
  MessageScroller,
  Questionnaire,
  ShimmerText,
  NumberTicker,
  Timer,
} satisfies Record<NativeName, ComponentType<never>>;

/** the component that draws each part the kit covers, by the part's id */
export const COMPONENTS = Object.fromEntries(Object.entries(NATIVE).map(([slug, name]) => [slug, BY_NAME[name]])) as unknown as Record<NativeSlug, ComponentType<never>>;
