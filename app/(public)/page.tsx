// Keep builds independent of the deployment-time database migration state.
// The underlying catalogue queries remain explicitly cached and tag-invalidated.
export const dynamic = "force-dynamic";

export { GalleryView as default } from "./gallery/gallery-view";
