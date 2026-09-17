import type { Metadata } from "next";

import { getPhotographs } from "@/lib/photographs/queries";
import { getSiteContent } from "@/lib/site-content/queries";
import { absoluteUrl, photographSocialImage, siteName } from "@/lib/seo";

// Keep builds independent of the deployment-time database migration state.
// The underlying catalogue queries remain explicitly cached and tag-invalidated.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
	const [siteContent, photographs] = await Promise.all([
		getSiteContent(),
		getPhotographs(),
	]);
	const socialImage = photographs[0]
		? [photographSocialImage(photographs[0])]
		: undefined;

	return {
		alternates: {
			canonical: "/",
		},
		description: siteContent.seoDescription,
		openGraph: {
			description: siteContent.seoDescription,
			images: socialImage,
			siteName,
			title: siteContent.seoTitle,
			type: "website",
			url: absoluteUrl("/"),
		},
		title: {
			absolute: siteContent.seoTitle,
		},
		twitter: {
			card: "summary_large_image",
			description: siteContent.seoDescription,
			images: socialImage,
			title: siteContent.seoTitle,
		},
	};
}

export { GalleryView as default } from "./gallery/gallery-view";
