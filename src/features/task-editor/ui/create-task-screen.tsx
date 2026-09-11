import { useRouter } from 'expo-router';

import type { PlacementMode } from '../model/editor-values';
import { TaskEditor } from './task-editor';

type CreateTaskScreenProps = {
  placement: PlacementMode;
  date: string;
};

export function CreateTaskScreen({ placement, date }: CreateTaskScreenProps) {
  const router = useRouter();
  return (
    <TaskEditor
      mode="create"
      initialPlacement={placement}
      initialDate={date}
      onSaved={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(placement === 'future' ? '/future' : '/');
        }
      }}
    />
  );
}
