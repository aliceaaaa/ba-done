import { Linking, Platform } from 'react-native';

export function mapUrlsForAddress(address: string, os: string = Platform.OS): string[] {
  const query = encodeURIComponent(address.trim());
  if (os === 'android') {
    return [`geo:0,0?q=${query}`, `https://www.google.com/maps/search/?api=1&query=${query}`];
  }
  return [`https://maps.apple.com/?q=${query}`];
}

export async function openAddressInMaps(address: string): Promise<boolean> {
  if (address.trim().length === 0) {
    return false;
  }
  for (const url of mapUrlsForAddress(address)) {
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}
