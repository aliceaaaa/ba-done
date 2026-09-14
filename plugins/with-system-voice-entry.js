const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  IOSConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withXcodeProject,
} = require('expo/config-plugins');

const NATIVE_ROOT = path.join(__dirname, '..', 'native');
const IOS_SOURCE_DIR = path.join(NATIVE_ROOT, 'ios', 'system-voice-entry');
const ANDROID_SOURCE_DIR = path.join(NATIVE_ROOT, 'android', 'system-voice-entry');
const IOS_GROUP = 'SystemVoiceEntry';
const IOS_FILES = ['SystemVoiceEntryIntents.swift', 'AppShortcuts.xcstrings'];
const SHORTCUTS_META_DATA = 'android.app.shortcuts';

function copyFile(from, to, transform = (content) => content) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, transform(fs.readFileSync(from, 'utf8')));
}

function withIosSources(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const { platformProjectRoot, projectRoot } = modConfig.modRequest;
      const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      for (const file of IOS_FILES) {
        copyFile(
          path.join(IOS_SOURCE_DIR, file),
          path.join(platformProjectRoot, projectName, IOS_GROUP, file),
        );
      }
      return modConfig;
    },
  ]);
}

function withIosProject(config) {
  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(modConfig.modRequest.projectRoot);
    const groupName = `${projectName}/${IOS_GROUP}`;
    IOSConfig.XcodeUtils.ensureGroupRecursively(project, groupName);
    for (const file of IOS_FILES) {
      const filepath = `${groupName}/${file}`;
      if (project.hasFile(filepath)) {
        continue;
      }
      if (file.endsWith('.swift')) {
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName, project });
      } else {
        IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath,
          groupName,
          project,
          isBuildFile: true,
        });
      }
    }
    const references = project.pbxFileReferenceSection();
    for (const reference of Object.values(references)) {
      if (typeof reference === 'object' && String(reference.path).includes('.xcstrings')) {
        reference.lastKnownFileType = 'text.json.xcstrings';
      }
    }
    project.addKnownRegion('ru');
    return modConfig;
  });
}

function withAndroidResources(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const scheme = Array.isArray(modConfig.scheme) ? modConfig.scheme[0] : modConfig.scheme;
      const packageName = modConfig.android?.package;
      if (typeof scheme !== 'string' || typeof packageName !== 'string') {
        throw new Error('with-system-voice-entry requires expo.scheme and expo.android.package');
      }
      const resDir = path.join(modConfig.modRequest.platformProjectRoot, 'app/src/main/res');
      copyFile(
        path.join(ANDROID_SOURCE_DIR, 'shortcuts.xml'),
        path.join(resDir, 'xml/shortcuts.xml'),
        (content) =>
          content.replaceAll('__PACKAGE__', packageName).replaceAll('__SCHEME__', scheme),
      );
      copyFile(
        path.join(ANDROID_SOURCE_DIR, 'strings.xml'),
        path.join(resDir, 'values/voice_shortcuts.xml'),
      );
      copyFile(
        path.join(ANDROID_SOURCE_DIR, 'strings-ru.xml'),
        path.join(resDir, 'values-ru/voice_shortcuts.xml'),
      );
      return modConfig;
    },
  ]);
}

function withAndroidShortcutsMetaData(config) {
  return withAndroidManifest(config, (modConfig) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(modConfig.modResults);
    const metaData = activity['meta-data'] ?? [];
    if (!metaData.some((item) => item.$['android:name'] === SHORTCUTS_META_DATA)) {
      metaData.push({
        $: { 'android:name': SHORTCUTS_META_DATA, 'android:resource': '@xml/shortcuts' },
      });
    }
    activity['meta-data'] = metaData;
    return modConfig;
  });
}

function withSystemVoiceEntry(config) {
  config = withIosSources(config);
  config = withIosProject(config);
  config = withAndroidResources(config);
  return withAndroidShortcutsMetaData(config);
}

module.exports = createRunOncePlugin(withSystemVoiceEntry, 'with-system-voice-entry', '1.0.0');
