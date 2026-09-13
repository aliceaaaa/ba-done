import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ScheduledTask } from '@/entities/task';
import { UI_STRINGS } from '@/shared/config/ui-strings';
import { colors, spacing } from '@/shared/ui/theme';

import { TaskCard } from './task-card';

export type CardPhase = 'idle' | 'sendingBack';

type SwipeDirection = 'right' | 'left';

const SWIPE_THRESHOLD = 96;
const ACTIVATION_OFFSET = 12;
const SLIDE_DURATION_MS = 180;

type SwipeableTaskCardProps = {
  task: ScheduledTask;
  phase: CardPhase;
  showReturnMessage: boolean;
  onOpen: (task: ScheduledTask) => void;
  onDone: (task: ScheduledTask) => void;
  onSendBack: (task: ScheduledTask) => void;
  onSentBack: (task: ScheduledTask) => void;
};

export function SwipeableTaskCard({
  task,
  phase,
  showReturnMessage,
  onOpen,
  onDone,
  onSendBack,
  onSentBack,
}: SwipeableTaskCardProps) {
  const { width } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const [direction, setDirection] = useState<SwipeDirection | null>(null);
  const arrivalStarted = useRef(false);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`swipe-${task.id}`)
        .enabled(phase === 'idle')
        .activeOffsetX([-ACTIVATION_OFFSET, ACTIVATION_OFFSET])
        .failOffsetY([-ACTIVATION_OFFSET, ACTIVATION_OFFSET])
        .onUpdate((event) => {
          translateX.set(event.translationX);
          scheduleOnRN(setDirection, event.translationX >= 0 ? 'right' : 'left');
        })
        .onEnd((event) => {
          if (event.translationX >= SWIPE_THRESHOLD) {
            scheduleOnRN(setDirection, 'right');
            translateX.set(
              withTiming(width, { duration: SLIDE_DURATION_MS }, (finished) => {
                if (finished) {
                  scheduleOnRN(onDone, task);
                }
              }),
            );
          } else if (event.translationX <= -SWIPE_THRESHOLD) {
            scheduleOnRN(setDirection, 'left');
            translateX.set(
              withTiming(-width, { duration: SLIDE_DURATION_MS }, (finished) => {
                if (finished) {
                  scheduleOnRN(onSendBack, task);
                }
              }),
            );
          } else {
            scheduleOnRN(setDirection, null);
            translateX.set(withSpring(0));
          }
        }),
    [phase, task, width, translateX, onDone, onSendBack],
  );

  useEffect(() => {
    if (phase === 'idle') {
      arrivalStarted.current = false;
      return;
    }
    if (arrivalStarted.current) {
      return;
    }
    arrivalStarted.current = true;
    translateX.set(
      withTiming(0, { duration: SLIDE_DURATION_MS }, (finished) => {
        if (finished) {
          scheduleOnRN(onSentBack, task);
        }
      }),
    );
  }, [phase, task, translateX, onSentBack]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  const label = phase === 'sendingBack' ? 'left' : direction;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        layout={LinearTransition}
        style={[styles.container, animatedStyle]}
        testID={`task-card-${task.id}`}
      >
        {label === null ? null : (
          <Text style={[styles.swipeLabel, label === 'right' ? styles.done : styles.notTonight]}>
            {label === 'right' ? UI_STRINGS.swipeRight : UI_STRINGS.swipeLeft}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens task details"
          onPress={() => onOpen(task)}
          testID={`open-task-${task.id}`}
        >
          <TaskCard task={task} showReturnMessage={showReturnMessage} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  swipeLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'none',
  },
  done: {
    color: colors.done,
  },
  notTonight: {
    color: colors.notTonight,
  },
});
