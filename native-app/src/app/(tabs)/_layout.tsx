import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { colors } from '../../lib/theme';

// Platform tab bars (UITabBarController on iOS, Material bottom navigation
// on Android) rather than a JS-drawn bar, which is most of what makes the
// app stop feeling like a website.
export default function TabsLayout() {
  return (
    <NativeTabs tintColor={colors.violetBright} backgroundColor={colors.bg}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="focus">
        <NativeTabs.Trigger.Label>Focus Lock</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'lock', selected: 'lock.fill' }} md="lock" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="groups">
        <NativeTabs.Trigger.Label>Groups</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} md="group" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
