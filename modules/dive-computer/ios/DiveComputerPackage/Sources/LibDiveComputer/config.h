/*
 * Hand-written config.h for building libdivecomputer 0.9.0 on iOS/Darwin.
 *
 * This project vendors libdivecomputer's source directly (copied under
 * DiveComputerLib/src and DiveComputerLib/include) and builds it directly
 * via a CocoaPods podspec instead of running the upstream
 * autotools (`./autogen.sh && ./configure`) build, since automake/cmake
 * are not available in this environment. The macro set below was derived
 * by grepping libdivecomputer's src C files for every HAVE_* it actually
 * references (see configure.ac for the authoritative list) and setting
 * only the ones that are true for iOS. USB (libusb), HID (hidapi) and
 * native Bluetooth (BlueZ) backends are intentionally left undefined —
 * those source files compile down to DC_STATUS_UNSUPPORTED stubs, which
 * is fine since this app only ever uses the DC_TRANSPORT_BLE custom I/O
 * path (see CustomIOBridge.swift).
 */

#ifndef LIBDIVECOMPUTER_CONFIG_H
#define LIBDIVECOMPUTER_CONFIG_H

/* POSIX / Darwin capabilities available on iOS */
#define HAVE_PTHREAD_H 1
#define HAVE_MACH_MACH_TIME_H 1
#define HAVE_MACH_ABSOLUTE_TIME 1
#define HAVE_CLOCK_GETTIME 1
#define HAVE_STRERROR_R 1
#define HAVE_LOCALTIME_R 1
#define HAVE_GMTIME_R 1
#define HAVE_TIMEGM 1
#define HAVE_STRUCT_TM_TM_GMTOFF 1

/* Explicitly NOT available / NOT wanted on iOS:
 *   HAVE_LIBUSB, HAVE_HIDAPI, HAVE_BLUEZ        - no USB/HID/native-BT transports
 *   HAVE_IOKIT_SERIAL_IOSS_H                    - macOS-only, not present on iOS
 *   HAVE_AF_IRDA_H, HAVE_LINUX_IRDA_H           - Windows/Linux IrDA only
 *   HAVE_LINUX_SERIAL_H, HAVE_WS2BTH_H          - Linux/Windows only
 *   HAVE_VERSION_SUFFIX                         - avoids needing a generated revision.h
 *   HAVE__MKGMTIME                              - Windows only
 */

#endif /* LIBDIVECOMPUTER_CONFIG_H */
