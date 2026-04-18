import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description: string;
  /** Optional path appended to current origin for canonical & og:url. Defaults to current pathname. */
  path?: string;
  /** Optional image URL (absolute) for OG/Twitter cards. */
  image?: string;
  /** Optional article/website type. */
  type?: "website" | "article";
  /** Mark page as noindex (e.g., auth flows). */
  noindex?: boolean;
}

const DEFAULT_IMAGE = "https://lovable.dev/opengraph-image-p98pqg.png";

export default function SEO({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  type = "website",
  noindex = false,
}: SEOProps) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const currentPath = path ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const url = `${origin}${currentPath}`;

  // Trim title/description to safe SEO lengths
  const safeTitle = title.length > 60 ? `${title.slice(0, 57)}…` : title;
  const safeDescription =
    description.length > 160 ? `${description.slice(0, 157)}…` : description;

  return (
    <Helmet>
      <title>{safeTitle}</title>
      <meta name="description" content={safeDescription} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:title" content={safeTitle} />
      <meta property="og:description" content={safeDescription} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:locale" content="ar_DZ" />
      <meta property="og:site_name" content="VisaRadar" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={safeTitle} />
      <meta name="twitter:description" content={safeDescription} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}
