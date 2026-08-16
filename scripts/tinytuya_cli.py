#!/usr/bin/env python3
"""CLI TinyTuya untuk Numa3D: scan LAN, baca daya plug, ambil local key dari cloud."""
from __future__ import annotations

import argparse
import json
import sys


def emit(obj, code=0):
    json.dump(obj, sys.stdout, ensure_ascii=False, default=str)
    sys.stdout.write("\n")
    sys.exit(code)


def fail(msg, extra=None, code=2):
    payload = {"error": msg}
    if extra is not None:
        payload["detail"] = extra
    emit(payload, code)


def load_tinytuya():
    try:
        import tinytuya  # noqa: F401
        return tinytuya
    except ImportError:
        fail(
            "tinytuya_not_installed",
            "Jalankan: python3 -m pip install tinytuya",
        )


def cmd_status(args):
    tinytuya = load_tinytuya()
    versions = [args.version] if args.version and args.version != "auto" else ["3.4", "3.3", "3.5", "3.1"]
    last = None
    for ver in versions:
        d = tinytuya.OutletDevice(args.id, args.ip, args.key)
        d.set_version(float(ver))
        d.set_socketTimeout(6)
        d.set_socketRetryLimit(1)
        data = d.status()
        last = data
        if isinstance(data, dict) and data.get("Error"):
            continue
        dps = (data or {}).get("dps") if isinstance(data, dict) else None
        if dps:
            emit({"ok": True, "dps": dps, "version": ver, "ip": args.ip})
    fail("status_failed", last)


def cmd_scan(args):
    tinytuya = load_tinytuya()
    devices = tinytuya.deviceScan(False, int(args.timeout))
    out = []
    for ip, info in (devices or {}).items():
        if not isinstance(info, dict):
            continue
        out.append(
            {
                "id": info.get("gwId") or info.get("id"),
                "ip": info.get("ip") or ip,
                "version": str(info.get("version") or ""),
                "productKey": info.get("productKey") or info.get("prodKey"),
                "name": info.get("name"),
            }
        )
    emit(out)


def cmd_cloud(args):
    tinytuya = load_tinytuya()
    kwargs = {
        "apiRegion": args.region,
        "apiKey": args.api_key,
        "apiSecret": args.api_secret,
    }
    if args.device_id:
        kwargs["apiDeviceID"] = args.device_id
    cloud = tinytuya.Cloud(**kwargs)
    devices = cloud.getdevices(False)
    if isinstance(devices, dict) and devices.get("Error"):
        fail("cloud_failed", devices)
    out = []
    for d in devices or []:
        if not isinstance(d, dict):
            continue
        out.append(
            {
                "id": d.get("id") or d.get("id"),
                "name": d.get("name"),
                "localKey": d.get("key") or d.get("local_key"),
                "ip": d.get("ip"),
                "category": d.get("category"),
                "mac": d.get("mac"),
            }
        )
    emit(out)


def cmd_check(_args):
    tinytuya = load_tinytuya()
    emit({"ok": True, "tinytuya": getattr(tinytuya, "__version__", "unknown")})


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("status")
    s.add_argument("--id", required=True)
    s.add_argument("--ip", required=True)
    s.add_argument("--key", required=True)
    s.add_argument("--version", default="auto")

    sc = sub.add_parser("scan")
    sc.add_argument("--timeout", default="8")

    c = sub.add_parser("cloud")
    c.add_argument("--api-key", required=True)
    c.add_argument("--api-secret", required=True)
    c.add_argument("--region", default="in")
    c.add_argument("--device-id", default="")

    sub.add_parser("check")

    args = p.parse_args()
    if args.cmd == "status":
        cmd_status(args)
    elif args.cmd == "scan":
        cmd_scan(args)
    elif args.cmd == "cloud":
        cmd_cloud(args)
    else:
        cmd_check(args)


if __name__ == "__main__":
    main()
