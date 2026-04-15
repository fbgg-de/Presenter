import { Chip, IconButton, MenuItem, Paper, Select, Stack, Tooltip, Typography } from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  FitScreen as FitWidthIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  AspectRatio as Zoom100Icon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { PdfLayerViewer } from '@/components/PdfLayerViewer';

interface LyricsFooterProps {
  variant: 'lyrics';
  copyright?: string;
  onImportPdf: () => void;
}

interface PdfFooterProps {
  variant: 'pdf';
  zoomLevel: number;
  numPages: number;
  resolvedFilename?: string | null;
  availableFilenames?: string[];
  onSelectPdf?: (filename: string) => void;
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
    const { copyright, onImportPdf } = props;
    return (
      <Paper elevation={2} square sx={{ bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', px: 2, py: 1, mt: 2 }}>
        {copyright && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            © {copyright}
          </Typography>
        )}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">
            {LL.PDF_NO_PDF_AVAILABLE()}
          </Typography>
          <Chip
            label={LL.PDF_IMPORT_TITLE()}
            size="small"
            icon={<PdfIcon />}
            onClick={onImportPdf}
            clickable
            color="primary"
            variant="outlined"
          />
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
      <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Zoom controls: [−] percentage [+] then 100%, fit-width */}
        {onZoomOut && (
          <Tooltip title={LL.MUSICIAN_ZOOM_OUT()}>
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
          <Tooltip title={LL.MUSICIAN_ZOOM_IN()}>
            <IconButton size="small" onClick={onZoomIn} sx={{ p: 0.25 }}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {onZoomReset && (
          <Tooltip title={LL.MUSICIAN_ZOOM_100()}>
            <IconButton size="small" onClick={onZoomReset} color={zoomPercent === 100 ? 'primary' : 'default'} sx={{ p: 0.25 }}>
              <Zoom100Icon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {onZoomFitWidth && (
          <Tooltip title={LL.MUSICIAN_ZOOM_FIT_WIDTH()}>
            <IconButton size="small" onClick={onZoomFitWidth} sx={{ p: 0.25 }}>
              <FitWidthIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {numPages > 0 && (
          <Typography variant="caption" color="text.secondary">
            {LL.MUSICIAN_PAGE_COUNT({ count: numPages })}
          </Typography>
        )}

        {/* PDF file selector — always shows a Select dropdown when onSelectPdf is provided */}
        {onSelectPdf && availableFilenames.length > 0 ? (
          <Select
            value={resolvedFilename ?? ''}
            onChange={(e) => onSelectPdf(e.target.value)}
            size="small"
            variant="standard"
            disableUnderline
            sx={{
              fontSize: '0.75rem',
              maxWidth: 200,
              '& .MuiSelect-select': { py: 0.25, px: 0.5 },
            }}
          >
            {availableFilenames.map((f) => (
              <MenuItem key={f} value={f} sx={{ fontSize: '0.75rem' }}>
                {f}
              </MenuItem>
            ))}
          </Select>
        ) : resolvedFilename ? (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
            {resolvedFilename}
          </Typography>
        ) : null}

        {onOpenPdfModal && (
          <Chip
            label={LL.MUSICIAN_MANAGE_PDFS()}
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
