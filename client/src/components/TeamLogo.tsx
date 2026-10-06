import { useState } from 'react';
import { initials } from '../lib/format';

interface TeamLogoProps {
  name: string;
  url: string | null;
}

/** Team logo with an initials fallback for missing or broken images. Decorative: the name is shown next to it. */
export function TeamLogo({ name, url }: TeamLogoProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) {
    return (
      <span className="team-logo team-logo--fallback" aria-hidden="true" data-testid="logo-fallback">
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      className="team-logo"
      src={url}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
    />
  );
}
