import type { ReferenceImageMode } from "./types";

export const REFERENCE_MODES: {
  key: ReferenceImageMode;
  label: string;
  description: string;
}[] = [
  {
    key: "face_swap",
    label: "Face Only",
    description: "Keep pose, background, outfit from reference, only replace face",
  },
  {
    key: "pose_background",
    label: "Pose & Background",
    description: "Reference the pose and background composition",
  },
  {
    key: "clothing_pose",
    label: "Clothing & Pose",
    description: "Reference the outfit and pose only",
  },
  {
    key: "custom",
    label: "Custom",
    description: "No preset - describe what you want in the message",
  },
];
