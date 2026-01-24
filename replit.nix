{ pkgs }: {
  deps = [
    pkgs.zip
    pkgs.libtool
    pkgs.automake
    pkgs.autoconf
    pkgs.cmake
    pkgs.pkg-config
    pkgs.bluez
    pkgs.libusb1
    pkgs.libdivecomputer
  ];
}