"""Read host resource counters without collecting process or user data."""
import ctypes
import time
from ctypes import wintypes


class _MemoryStatus(ctypes.Structure):
    _fields_ = [
        ("dwLength", wintypes.DWORD), ("dwMemoryLoad", wintypes.DWORD),
        ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]


class _IfRow(ctypes.Structure):
    _fields_ = [
        ("wszName", wintypes.WCHAR * 256), ("dwIndex", wintypes.DWORD),
        ("dwType", wintypes.DWORD), ("dwMtu", wintypes.DWORD),
        ("dwSpeed", wintypes.DWORD), ("dwPhysAddrLen", wintypes.DWORD),
        ("bPhysAddr", ctypes.c_ubyte * 8), ("dwAdminStatus", wintypes.DWORD),
        ("dwOperStatus", wintypes.DWORD), ("dwLastChange", wintypes.DWORD),
        ("dwInOctets", wintypes.DWORD), ("dwInUcastPkts", wintypes.DWORD),
        ("dwInNUcastPkts", wintypes.DWORD), ("dwInDiscards", wintypes.DWORD),
        ("dwInErrors", wintypes.DWORD), ("dwInUnknownProtos", wintypes.DWORD),
        ("dwOutOctets", wintypes.DWORD), ("dwOutUcastPkts", wintypes.DWORD),
        ("dwOutNUcastPkts", wintypes.DWORD), ("dwOutDiscards", wintypes.DWORD),
        ("dwOutErrors", wintypes.DWORD), ("dwOutQLen", wintypes.DWORD),
    ]


def _network_bytes():
    iphlpapi = ctypes.WinDLL("iphlpapi.dll")
    get_table = iphlpapi.GetIfTable
    size = wintypes.DWORD(0)
    get_table(None, ctypes.byref(size), False)
    buffer = ctypes.create_string_buffer(size.value)
    if get_table(buffer, ctypes.byref(size), False) != 0:
        raise OSError("Windows network counters unavailable")
    count = ctypes.cast(buffer, ctypes.POINTER(wintypes.DWORD)).contents.value
    rows = ctypes.cast(ctypes.addressof(buffer) + ctypes.sizeof(wintypes.DWORD), ctypes.POINTER(_IfRow))
    # Sum active non-loopback interfaces; names/MAC addresses never leave this function.
    active = [rows[index] for index in range(count) if rows[index].dwOperStatus == 5 and rows[index].dwType != 24]
    return (
        sum(row.dwOutOctets for row in active),
        sum(row.dwInOctets for row in active),
    )


def _system_times():
    idle, kernel, user = wintypes.FILETIME(), wintypes.FILETIME(), wintypes.FILETIME()
    if not ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)):
        raise OSError("Windows CPU counters unavailable")
    as_int = lambda value: (value.dwHighDateTime << 32) | value.dwLowDateTime
    return as_int(idle), as_int(kernel), as_int(user)


def _cpu_percent(interval):
    before = _system_times()
    time.sleep(interval)
    after = _system_times()
    idle_delta = after[0] - before[0]
    total_delta = (after[1] - before[1]) + (after[2] - before[2])
    return round(max(0.0, min(100.0, (1 - idle_delta / total_delta) * 100)), 2) if total_delta else 0.0


def collect_host_metrics(interval=1.0, disk_path="C:\\"):
    """Return genuine OS metrics; only numeric values and fixed metric names."""
    if not hasattr(ctypes, "windll"):
        raise OSError("Live host collection currently supports Windows only")
    cpu = _cpu_percent(interval)
    memory = _MemoryStatus()
    memory.dwLength = ctypes.sizeof(memory)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
        raise OSError("Windows memory counters unavailable")
    total = ctypes.c_ulonglong()
    free = ctypes.c_ulonglong()
    if not ctypes.windll.kernel32.GetDiskFreeSpaceExW(disk_path, None, ctypes.byref(total), ctypes.byref(free)):
        raise OSError("Windows disk counters unavailable")
    sent, received = _network_bytes()
    return {
        "cpu_utilization": cpu,
        "memory_utilization": round((1 - memory.ullAvailPhys / memory.ullTotalPhys) * 100, 2),
        "disk_utilization": round((1 - free.value / total.value) * 100, 2) if total.value else 0.0,
        "network_bytes_sent": sent,
        "network_bytes_received": received,
    }
