import { RouteLoadingPanel } from "@/components/pulse-loader";

/**
 * Shown while a server segment under the authenticated app is loading.
 */
export default function AppLoading() {
  return <RouteLoadingPanel label="Loading workspace…" />;
}
