import { Box, Chip, IconButton, Paper, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  FitScreen as FitWidthIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  AspectRatio as Zoom100Icon,
  Subject as LyricsIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { PdfLayerViewer } from '@/components/pdf/PdfLayerViewer';

/** `LYRICS` in the switcher stands for the plain lyrics view; every other value is a PDF file. */
const LYRICS = '';

/**
 * What the musician reads for this song: the plain lyrics or one of its PDF versions, one tap
 * each. It replaces a borderless filename dropdown that took two taps and hid the lyrics view.
 * Scrolls sideways instead of wrapping when a song has many versions.
 */
const ViewSwitcher = ({ versions, current, onSelect }: { versions: string[]; current: string; onSelect: (version: string) => void }) => {
  const { LL } = useI18nContext();
  return (
    // On a phone: a row of its own at the bottom, the one strip the floating up/down buttons leave free.
    <Box sx={{ maxWidth: '100%', overflowX: 'auto', order: { xs: 1, sm: 0 }, width: { xs: '100%', sm: 'auto' } }}>
      <ToggleButtonGroup size="small" exclusive value={current} onChange={(_, value: string | null) => value !== null && onSelect(value)}>
        <ToggleButton value={LYRICS} sx={{ py: 0.25, gap: 0.5, textTransform: 'none' }}>
          <LyricsIcon fontSize="small" />
          {LL.MUSICIAN.VIEW_LYRICS()}
        </ToggleButton>
        {versions.map((file) => (
          <ToggleButton key={file} value={file} title={file} sx={{ py: 0.25, gap: 0.5, textTransform: 'none', whiteSpace: 'nowrap' }}>
            <PdfIcon fontSize="small" />
            {file.replace(/\.pdf$/i, '')}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
};

interface LyricsFooterProps {
  variant: 'lyrics';
  copyright?: string;
  onImportPdf: () => void;
  /** The song's PDF versions, when it has any — the lyrics view was then picked over them. */
  pdfVersions?: string[];
  onSelectPdf?: (filename: string) => void;
}

interface PdfFooterProps {
  variant: 'pdf';
  zoomLevel: number;
  numPages: number;
  resolvedFilename?: string | null;
  availableFilenames?: string[];
  onSelectPdf?: (filename: string) => void;
  onShowLyrics?: () => void;
  /** The PDF as loaded, offered for download under `downloadName`. */
  pdfUrl?: string | null;
  downloadName?: string;
  onOpenPdfModal?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onZoomFitWidth?: () => void;
  /** Song number for the layer viewer */
  songNumber?: number;
  /** Filename for the layer viewer */
  filename?: string;
  /** Shared annotation visibility state (lifted to PdfView) */
  showAnnotations?: boolean;
  onShowAnnotationsChange?: (visible: boolean) => void;
  hiddenLayers?: Set<string>;
  onToggleLayerVisibility?: (layer: string) => void;
}

export type MusicianFooterProps = LyricsFooterProps | PdfFooterProps;

/**
 * Shared footer bar used at the bottom of both the lyrics view and the PDF view
 * in the musician page. Keeps layout, styling, and i18n strings consistent.
 */
export const MusicianFooter = (props: MusicianFooterProps) => {
  const { LL } = useI18nContext();

  if (props.variant === 'lyrics') {
    const { copyright, onImportPdf, pdfVersions = [], onSelectPdf } = props;
    return (
      <Paper elevation={2} square sx={{ bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', px: 2, py: 1, mt: 2 }}>
        {copyright && (
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              mb: 1,
              display: 'block',
            }}
          >
            {copyright}
          </Typography>
        )}
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {pdfVersions.length > 0 && onSelectPdf ? (
            <ViewSwitcher versions={pdfVersions} current={LYRICS} onSelect={(version) => version !== LYRICS && onSelectPdf(version)} />
          ) : (
            <>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                }}
              >
                {LL.PDF.NO_PDF_AVAILABLE()}
              </Typography>
              <Chip
                label={LL.PDF.IMPORT_TITLE()}
                size="small"
                icon={<PdfIcon />}
                onClick={onImportPdf}
                clickable
                color="primary"
                variant="outlined"
              />
            </>
          )}
        </Stack>
      </Paper>
    );
  }

  // variant === 'pdf'
  const {
    zoomLevel,
    numPages,
    resolvedFilename,
    availableFilenames = [],
    onSelectPdf,
    onShowLyrics,
    pdfUrl,
    downloadName,
    onOpenPdfModal,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onZoomFitWidth,
    songNumber,
    filename,
    showAnnotations,
    onShowAnnotationsChange,
    hiddenLayers,
    onToggleLayerVisibility,
  } = props;

  const zoomPercent = Math.round(zoomLevel * 100);

  return (
    <Paper elevation={2} square sx={{ bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', px: 2, py: 1, width: '100%' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {onSelectPdf && onShowLyrics && availableFilenames.length > 0 ? (
          <ViewSwitcher
            versions={availableFilenames}
            current={resolvedFilename ?? ''}
            onSelect={(version) => (version === LYRICS ? onShowLyrics() : onSelectPdf(version))}
          />
        ) : resolvedFilename ? (
          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', maxWidth: 200 }}>
            {resolvedFilename}
          </Typography>
        ) : null}

        {/* The file as stored. With annotations it comes out of the annotation toolbar instead. */}
        {pdfUrl && (
          <Tooltip title={LL.MUSICIAN.DOWNLOAD_PDF()}>
            <IconButton size="small" component="a" href={pdfUrl} download={downloadName ?? resolvedFilename ?? true} sx={{ p: 0.25 }}>
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Zoom controls: [−] percentage [+] then 100%, fit-width */}
        {onZoomOut && (
          <Tooltip title={LL.MUSICIAN.ZOOM_OUT()}>
            <IconButton size="small" onClick={onZoomOut} sx={{ p: 0.25 }}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Zoom percentage — display-only */}
        <Chip
          label={`${zoomPercent}%`}
          size="small"
          variant={zoomPercent === 100 ? 'filled' : 'outlined'}
          color={zoomPercent === 100 ? 'default' : 'primary'}
          sx={{ fontWeight: 600, minWidth: 52 }}
        />

        {onZoomIn && (
          <Tooltip title={LL.MUSICIAN.ZOOM_IN()}>
            <IconButton size="small" onClick={onZoomIn} sx={{ p: 0.25 }}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {onZoomReset && (
          <Tooltip title={LL.MUSICIAN.ZOOM_100()}>
            <IconButton size="small" onClick={onZoomReset} color={zoomPercent === 100 ? 'primary' : 'default'} sx={{ p: 0.25 }}>
              <Zoom100Icon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {onZoomFitWidth && (
          <Tooltip title={LL.MUSICIAN.ZOOM_FIT_WIDTH()}>
            <IconButton size="small" onClick={onZoomFitWidth} sx={{ p: 0.25 }}>
              <FitWidthIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {numPages > 0 && (
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
            }}
          >
            {LL.MUSICIAN.PAGE_COUNT({ count: numPages })}
          </Typography>
        )}

        {onOpenPdfModal && (
          <Chip
            label={LL.MUSICIAN.MANAGE_PDFS()}
            size="small"
            icon={<PdfIcon />}
            onClick={onOpenPdfModal}
            clickable
            color="primary"
            variant="outlined"
          />
        )}

        {/* Layer viewer — available in PDF footer (read-only, no delete) */}
        {songNumber != null && filename && hiddenLayers && onToggleLayerVisibility && (
          <PdfLayerViewer
            songNumber={songNumber}
            filename={filename}
            triggerVariant="chip"
            showAnnotations={showAnnotations}
            onShowAnnotationsChange={onShowAnnotationsChange}
            hiddenLayers={hiddenLayers}
            onToggleLayerVisibility={onToggleLayerVisibility}
          />
        )}
      </Stack>
    </Paper>
  );
};
