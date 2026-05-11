import { useEffect, useState } from "react";
import packageJson from "../../../package.json";
import { appVersion, isTauri } from "../../tauri";

const FALLBACK_VERSION = packageJson.version;

export function useAppVersion() {
  const [version, setVersion] = useState(FALLBACK_VERSION);

  useEffect(() => {
    if (!isTauri()) return;

    appVersion()
      .then(setVersion)
      .catch(() => setVersion(FALLBACK_VERSION));
  }, []);

  return version;
}
