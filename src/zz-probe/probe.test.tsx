import { useState } from 'react';
import { Text } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { act, render, screen } from '@testing-library/react-native';

function Card() {
  const [label, setLabel] = useState('none');
  console.log('render', label);
  const x = useSharedValue(0);
  const pan = Gesture.Pan().withTestId('pan')
    .onUpdate((e) => { x.set(e.translationX); console.log('calling setLabel'); scheduleOnRN(setLabel, e.translationX > 0 ? 'Done' : 'Not tonight'); })
    .onEnd(() => { x.set(withTiming(300, { duration: 200 })); });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return <GestureHandlerRootView><GestureDetector gesture={pan}><Animated.View style={style}><Text>{label}</Text></Animated.View></GestureDetector></GestureHandlerRootView>;
}
it('probe', async () => {
  await render(<Card />);
  await act(async () => { fireGestureHandler(getByGestureTestId('pan'), [{ state: State.BEGAN, translationX: 0 }, { state: State.ACTIVE, translationX: 20 }, { translationX: 80 }, { state: State.END, translationX: 150 }]); });
  console.log('label:', screen.queryByText('Done') ? 'Done' : 'missing');
});
