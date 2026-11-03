import { installAdminHistoryGuard } from "./app/(admin)/admin/photos/unsaved-changes";

// Register before hydration: Next's earlier popstate listener could otherwise
// unmount an editor before a guard added when that editor becomes dirty runs.
// This listener is inert unless an admin form has registered unfinished work.
installAdminHistoryGuard();
