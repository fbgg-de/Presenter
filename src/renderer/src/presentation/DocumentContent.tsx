/** A document page on a screen: the window opens the file itself and steps it to the page it is sent. */
import { useEffect, useRef, useState } from 'react';
import { takeDocument, type OpenedDocument } from '@/document/openDocument';
import { blockScreenInput } from './screenDocuments';
import type { PresentationDocument } from './types';

export const DocumentContent = ({ document: doc }: { document: PresentationDocument }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<OpenedDocument | null>(null);

  // Kept open after this screen moves on (see takeDocument), so coming back to it is instant.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    blockScreenInput();
    let cancelled = false;
    const lease = takeDocument(doc.kind, doc.url);
    box.appendChild(lease.host);
    lease.opened
      .then((d) => {
        if (!cancelled) setOpened(d);
      })
      .catch((error: unknown) =>
        console.error(`[document] Could not open ${doc.url}: ${error instanceof Error ? error.message : String(error)}`),
      );
    return () => {
      cancelled = true;
      lease.release();
      setOpened(null);
    };
  }, [doc.kind, doc.url]);

  useEffect(() => {
    opened?.show(doc.page, doc.step);
  }, [opened, doc.page, doc.step]);

  return <div ref={boxRef} style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }} />;
};
