const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject, IOSConfig } = require('@expo/config-plugins');

const PRODUCT_NAME = 'DiveComputerKit';
const PACKAGE_DIR_NAME = 'DiveComputerPackage';
const NATIVE_FILES = ['DiveComputerBridge.m'];

// dive-computer's native iOS side (see modules/dive-computer/ios) is a plain
// app-target Objective-C file + a local Swift Package, not an Expo autolinked
// CocoaPod - so nothing here survives `expo prebuild` on its own. This
// plugin re-applies all of it (copying the bridge file, wiring the SPM
// package + product into the Xcode project) on every prebuild. The bridge is
// Objective-C rather than Swift because it self-registers with the classic
// RN bridge via RCT_EXPORT_MODULE, and calls into DiveComputerFacade (see
// DiveComputerFacade.swift in the package) via `@import DiveComputerKit` -
// no bridging header needed.
function withDiveComputerFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const sourceRoot = path.join(config.modRequest.platformProjectRoot, config.modRequest.projectName);
      const nativeSrcDir = path.join(config.modRequest.projectRoot, 'modules/dive-computer/ios/native');

      for (const file of NATIVE_FILES) {
        fs.copyFileSync(path.join(nativeSrcDir, file), path.join(sourceRoot, file));
      }

      return config;
    },
  ]);
}

function addLocalSwiftPackage(project, targetUuid) {
  const objects = project.hash.project.objects;
  objects.XCLocalSwiftPackageReference = objects.XCLocalSwiftPackageReference || {};
  objects.XCSwiftPackageProductDependency = objects.XCSwiftPackageProductDependency || {};

  // Already wired up (re-running prebuild without --clean) - nothing to do.
  const existingRef = Object.values(objects.XCLocalSwiftPackageReference).find(
    (ref) => ref && ref.relativePath && ref.relativePath.includes(PACKAGE_DIR_NAME)
  );
  if (existingRef) {
    return;
  }

  const packageRefUuid = project.generateUuid();
  const packageRefComment = `XCLocalSwiftPackageReference "../modules/dive-computer/ios/${PACKAGE_DIR_NAME}"`;
  objects.XCLocalSwiftPackageReference[packageRefUuid] = {
    isa: 'XCLocalSwiftPackageReference',
    relativePath: `../modules/dive-computer/ios/${PACKAGE_DIR_NAME}`,
  };
  objects.XCLocalSwiftPackageReference[`${packageRefUuid}_comment`] = packageRefComment;

  const productDepUuid = project.generateUuid();
  objects.XCSwiftPackageProductDependency[productDepUuid] = {
    isa: 'XCSwiftPackageProductDependency',
    package: packageRefUuid,
    package_comment: packageRefComment,
    productName: PRODUCT_NAME,
  };
  objects.XCSwiftPackageProductDependency[`${productDepUuid}_comment`] = PRODUCT_NAME;

  // PBXProject.packageReferences
  const { uuid: projectUuid, firstProject } = project.getFirstProject();
  firstProject.packageReferences = firstProject.packageReferences || [];
  firstProject.packageReferences.push({ value: packageRefUuid, comment: packageRefComment });
  objects.PBXProject[projectUuid] = firstProject;

  // PBXNativeTarget.packageProductDependencies
  const nativeTarget = project.pbxNativeTargetSection()[targetUuid];
  nativeTarget.packageProductDependencies = nativeTarget.packageProductDependencies || [];
  nativeTarget.packageProductDependencies.push({ value: productDepUuid, comment: PRODUCT_NAME });

  // PBXBuildFile linking the product into the target's Frameworks phase.
  const buildFileUuid = project.generateUuid();
  objects.PBXBuildFile = objects.PBXBuildFile || {};
  objects.PBXBuildFile[buildFileUuid] = {
    isa: 'PBXBuildFile',
    productRef: productDepUuid,
    productRef_comment: PRODUCT_NAME,
  };
  objects.PBXBuildFile[`${buildFileUuid}_comment`] = `${PRODUCT_NAME} in Frameworks`;

  const frameworksPhase = project.pbxFrameworksBuildPhaseObj(targetUuid);
  frameworksPhase.files.push({ value: buildFileUuid, comment: `${PRODUCT_NAME} in Frameworks` });
}

function withDiveComputerXcodeProject(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName;
    const { uuid: targetUuid } = project.getFirstTarget();

    for (const file of NATIVE_FILES) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: `${projectName}/${file}`,
        groupName: projectName,
        project,
        targetUuid,
      });
    }

    addLocalSwiftPackage(project, targetUuid);

    return config;
  });
}

module.exports = function withDiveComputerNative(config) {
  config = withDiveComputerFiles(config);
  config = withDiveComputerXcodeProject(config);
  return config;
};
