// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "DiveComputerPackage",
  // Matches the app's iOS deployment target (15.1, see ios/Podfile) so the
  // linker doesn't warn about mixing min-OS versions.
  platforms: [.iOS(.v15)],
  products: [
    .library(name: "LibDiveComputer", targets: ["LibDiveComputer"]),
    .library(name: "DiveComputerKit", targets: ["DiveComputerKit"]),
  ],
  targets: [
    // Vendored libdivecomputer source, copied from this repo's own local
    // package (see /src and /include/libdivecomputer at the project root -
    // that copy is newer than the released v0.9.0 tag and includes extra
    // Shearwater/Avelo support; COPYING has its LGPL license). Built straight
    // from source rather than through its own autotools/CMake build - see
    // config.h for what was hand-derived from configure.ac instead of
    // running `configure`.
    .target(
      name: "LibDiveComputer",
      cSettings: [
        .define("HAVE_CONFIG_H", to: "1"),
      ]
    ),
    .target(
      name: "DiveComputerKit",
      dependencies: ["LibDiveComputer"]
    ),
  ]
)
