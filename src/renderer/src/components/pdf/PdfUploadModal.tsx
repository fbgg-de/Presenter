import { useState, useRef, useCallback, useMemo, useEffect, type DragEvent, type ChangeEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  Upload as UploadIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Search as SearchIcon,
  InsertDriveFile as FileIcon,
  CheckCircle as ActiveIcon,
  PictureInPicture as MappingIcon,
  MusicNote as MusicNoteIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useListPdfsQuery, useUploadPdfMutation, useDeletePdfMutation, useRenamePdfMutation, type PdfFileInfo } from '@/api/pdfs.api';
import { useImportCcliChordsMutation, useLazyGetChurchToolsCcliDetailQuery } from '@/api/churchtools.api';
import { MUSICAL_KEYS } from '@/utils/orderKeyUtils';
import { SONG_CUSTOM_NUMBER_LIMIT } from '@/song';
import { formatDateTime, formatFileSize } from '@/utils';
import { useMetrics } from '@/hooks/useMetrics';
import { useGetSessionQuery } from '@/api/session.api';

/**
 * Try to detect a musical key from a filename.
 */
const detectKeyFromFilename = (filename: string): string | undefined => {
  const base = filename.replace(/\.pdf$/i, '');
  const parts = base.split('-');
  if (parts.length < 2) return undefined;
  const lastPart = parts[parts.length - 1].trim();
  return MUSICAL_KEYS.find((k) => k.toLowerCase() === lastPart.toLowerCase());
};

interface PdfUploadModalProps {
  songNumber: number;
  open: boolean;
  onClose: () => void;
  musicianNames?: string[];
  /** Currently selected/active PDF filename */
  selectedPdf?: string | null;
  /** Called when user selects a specific PDF to display */
  onSelectPdf?: (filename: string | null) => void;
  /** Called to open the area mapping editor for a specific PDF */
  onOpenAreaMapping?: () => void;
  /** ChurchTools song name — used as the title when importing the chord chart from CCLI */
  ctSongName?: string;
}

export const PdfUploadModal = ({
  songNumber,
  open,
  onClose,
  musicianNames = [],
  selectedPdf,
  onSelectPdf,
  onOpenAreaMapping,
  ctSongName,
}: PdfUploadModalProps) => {
  const { LL } = useI18nContext();
  const { trackEvent } = useMetrics();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine if ChurchTools is globally enabled
  const { data: session } = useGetSessionQuery();
  const churchToolsEnabled = session?.settings?.churchToolsEnabled ?? false;

  // Import form state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [detectedKey, setDetectedKey] = useState<string>('');
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [markDefault, setMarkDefault] = useState(false);
  const [assignMusician, setAssignMusician] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Manage view state
  const [filter, setFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: pdfs = [], isLoading } = useListPdfsQuery({ songNumber }, { skip: !open });
  const [uploadPdf, { isLoading: isUploading }] = useUploadPdfMutation();
  const [deletePdf, { isLoading: isDeleting }] = useDeletePdfMutation();
  const [renamePdf] = useRenamePdfMutation();

  // CCLI chord-chart download — only for CCLI-imported songs (which use the CCLI number as
  // their song number), when ChurchTools is configured.
  const isCcliSong = songNumber >= SONG_CUSTOM_NUMBER_LIMIT;
  const [importChords] = useImportCcliChordsMutation();
  const [fetchCcliDetail] = useLazyGetChurchToolsCcliDetailQuery();
  const [chordKey, setChordKey] = useState('');
  const [defaultKey, setDefaultKey] = useState('');
  const [chordColumns, setChordColumns] = useState(2);
  const [chordDefault, setChordDefault] = useState(false);
  const [chordLoading, setChordLoading] = useState(false);
  const [chordMsg, setChordMsg] = useState<{ severity: 'success' | 'info' | 'error'; text: string } | null>(null);
  // Resolving the CCLI detail (for the default key) takes a moment; track it for the skeleton.
  const [chordDetailLoading, setChordDetailLoading] = useState(false);
  // A CCLI song with no default key has no chord sheet on CCLI → don't offer the import.
  const [chordAvailable, setChordAvailable] = useState(true);

  // For CCLI songs, resolve the song's default key once the modal opens and preselect it.
  useEffect(() => {
    if (!open || !isCcliSong || !churchToolsEnabled) return;
    let cancelled = false;
    setChordDetailLoading(true);
    setChordAvailable(true);
    (async () => {
      try {
        const detail = await fetchCcliDetail({ songNumber }, true).unwrap();
        if (cancelled) return;
        const k = detail.key ?? '';
        setDefaultKey(k);
        setChordKey((prev) => (prev === '' ? k : prev));
        // No key in the CCLI metadata means CCLI has no chord sheet for this song.
        setChordAvailable(!!k);
      } catch {
        // Unknown — keep offering the import (best-effort; the backend reports if unavailable).
        if (!cancelled) setChordAvailable(true);
      } finally {
        if (!cancelled) setChordDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isCcliSong, churchToolsEnabled, songNumber, fetchCcliDetail]);

  const handleDownloadChords = async () => {
    setChordLoading(true);
    setChordMsg(null);
    let key = chordKey;
    let title = ctSongName ?? '';
    // When no key was explicitly chosen (or the title is unknown), resolve them from CCLI.
    if (key === '' || title === '') {
      try {
        const detail = await fetchCcliDetail({ songNumber }, false).unwrap();
        if (key === '') key = detail.key ?? '';
        if (title === '') title = detail.name ?? '';
      } catch {
        /* fall through with what we have; backend defaults the key */
      }
    }
    try {
      const res = await importChords({ songNumber, title, key, columns: chordColumns, markDefault: chordDefault }).unwrap();
      trackEvent('ccli_chords_imported', 'pdf', String(songNumber), {
        key: key || 'original',
        columns: chordColumns,
        default: chordDefault,
        filename: res.filename,
      });
      setChordMsg({ severity: 'success', text: LL.PDF.IMPORT_CHORDS_SUCCESS() });
    } catch (err) {
      const status = (err as { status?: number }).status;
      setChordMsg({
        severity: status === 404 ? 'info' : 'error',
        text: status === 404 ? LL.PDF.IMPORT_CHORDS_NONE() : LL.PDF.IMPORT_CHORDS_ERROR(),
      });
    } finally {
      setChordLoading(false);
    }
  };

  const existingFilenames = useMemo(() => pdfs.map((p) => p.filename.toLowerCase()), [pdfs]);

  // Build the target filename from metadata
  const buildTargetFilename = useCallback((): string => {
    const key = selectedKey || detectedKey;
    if (markDefault) {
      return key ? `Default-${key}.pdf` : 'Default.pdf';
    }
    if (assignMusician) {
      return key ? `${assignMusician}-${key}.pdf` : `${assignMusician}.pdf`;
    }
    return pendingFile?.name || 'Default.pdf';
  }, [selectedKey, detectedKey, markDefault, assignMusician, pendingFile]);

  const targetFilename = buildTargetFilename();
  const isDuplicate = existingFilenames.includes(targetFilename.toLowerCase());

  const handleFileSelected = (file: File) => {
    setPendingFile(file);
    const key = detectKeyFromFilename(file.name);
    setDetectedKey(key || '');
    setSelectedKey(key || '');
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith('.pdf')) {
        handleFileSelected(file);
      }
    }
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    const formData = new FormData();
    formData.append('files[]', new File([pendingFile], targetFilename, { type: pendingFile.type }));
    try {
      await uploadPdf({ songNumber, formData }).unwrap();
      trackEvent('pdf_uploaded', 'pdf', targetFilename, { songNumber, filename: targetFilename });
      setPendingFile(null);
      setDetectedKey('');
      setSelectedKey('');
      setMarkDefault(false);
      setAssignMusician('');
    } catch (err) {
      console.error('Failed to upload PDF:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePdf({ songNumber, filename: deleteTarget }).unwrap();
      trackEvent('pdf_deleted', 'pdf', deleteTarget, { songNumber });
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete PDF:', err);
    }
  };

  const handleSetDefault = async (pdf: PdfFileInfo) => {
    const key = detectKeyFromFilename(pdf.filename);
    const newName = key ? `Default-${key}.pdf` : 'Default.pdf';
    if (pdf.filename === newName) return;

    // Demote a former default to a non-default name, keeping its own key as the trailing
    // segment (so it stays detectable) and bumping the label for uniqueness.
    const taken = new Set(pdfs.map((p) => p.filename.toLowerCase()));
    const demotedName = (ownKey: string | undefined): string => {
      const keySuffix = ownKey ? `-${ownKey}` : '';
      let n = 0;
      let name = `Chords${keySuffix}.pdf`;
      while (taken.has(name.toLowerCase())) {
        n += 1;
        name = `Chords${n}${keySuffix}.pdf`;
      }
      taken.add(name.toLowerCase());
      return name;
    };

    try {
      // Demote every other current default (regardless of key) so exactly one default remains.
      const oldDefaults = pdfs.filter((p) => p.filename !== pdf.filename && p.filename.toLowerCase().startsWith('default'));
      for (const old of oldDefaults) {
        await renamePdf({ songNumber, oldName: old.filename, newName: demotedName(detectKeyFromFilename(old.filename)) }).unwrap();
      }
      await renamePdf({ songNumber, oldName: pdf.filename, newName }).unwrap();
    } catch (err) {
      console.error('Failed to set default PDF:', err);
    }
  };

  const handleClose = () => {
    setPendingFile(null);
    setDetectedKey('');
    setSelectedKey('');
    setMarkDefault(false);
    setAssignMusician('');
    onClose();
  };

  const filteredPdfs = filter ? pdfs.filter((p) => p.filename.toLowerCase().includes(filter.toLowerCase())) : pdfs;

  const allMusicianNames = useMemo(() => {
    const names = new Set(musicianNames);
    for (const pdf of pdfs) {
      const base = pdf.filename.replace(/\.pdf$/i, '');
      const firstPart = base.split('-')[0];
      if (firstPart !== 'Default') {
        names.add(firstPart);
      }
    }
    return Array.from(names).sort();
  }, [musicianNames, pdfs]);

  // Resolve which PDF is currently active (selected or auto-resolved)
  const activePdfFilename = selectedPdf || null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack
          direction="row"
          sx={{
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
            }}
          >
            <PdfIcon />
            <Typography variant="h6">{LL.PDF.MANAGE_TITLE()}</Typography>
            <Chip label={`#${songNumber}`} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />
          </Stack>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {/* Search filter */}
          {pdfs.length > 3 && (
            <TextField
              size="small"
              fullWidth
              placeholder={LL.PDF.SEARCH()}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
                },
              }}
            />
          )}

          {/* File list */}
          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                p: 2,
              }}
            >
              <CircularProgress />
            </Box>
          ) : filteredPdfs.length === 0 && !filter ? (
            <Alert severity="info">{LL.PDF.NO_FILES()}</Alert>
          ) : filteredPdfs.length === 0 ? (
            <Alert severity="info">{LL.PDF.NO_FILES()}</Alert>
          ) : (
            <List dense disablePadding>
              {filteredPdfs.map((pdf: PdfFileInfo) => {
                const isDefault = pdf.filename.toLowerCase().startsWith('default');
                const isActive = activePdfFilename === pdf.filename;
                return (
                  <ListItem
                    key={pdf.filename}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      bgcolor: isActive ? 'action.selected' : undefined,
                      border: isActive ? '2px solid' : '2px solid transparent',
                      borderColor: isActive ? 'primary.main' : 'transparent',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                    secondaryAction={
                      <Stack direction="row" spacing={0.5}>
                        {/* Use this PDF button */}
                        {!isActive && (
                          <Tooltip title={LL.PDF.SELECT_FILE()}>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                trackEvent('pdf_viewed', 'pdf', pdf.filename, { songNumber });
                                onSelectPdf?.(pdf.filename);
                              }}
                            >
                              <ActiveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {/* Block area mapping */}
                        {onOpenAreaMapping && (
                          <Tooltip title={LL.MUSICIAN.AREA_MAPPING()}>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPdf?.(pdf.filename);
                                handleClose();
                                onOpenAreaMapping();
                              }}
                            >
                              <MappingIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {/* Set as default */}
                        {!isDefault && (
                          <Tooltip title={LL.PDF.SET_DEFAULT()}>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetDefault(pdf);
                              }}
                            >
                              <StarBorderIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {/* Delete */}
                        <Tooltip title={LL.PDF.DELETE()}>
                          <IconButton
                            edge="end"
                            size="small"
                            color="error"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(pdf.filename);
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {isActive ? <ActiveIcon fontSize="small" color="primary" /> : <PdfIcon fontSize="small" color="error" />}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{
                            alignItems: 'center',
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: isActive ? 700 : 400,
                            }}
                          >
                            {pdf.filename}
                          </Typography>
                          {isDefault && (
                            <Chip
                              icon={<StarIcon sx={{ fontSize: '0.8rem !important' }} />}
                              label={LL.PDF.IS_DEFAULT()}
                              size="small"
                              color="primary"
                              variant="outlined"
                              sx={{ height: 18, fontSize: '0.65rem' }}
                            />
                          )}
                          {isActive && <Chip label="Active" size="small" color="primary" sx={{ height: 18, fontSize: '0.65rem' }} />}
                        </Stack>
                      }
                      secondary={
                        <Stack direction="row" spacing={1} component="span">
                          <Chip label={formatFileSize(pdf.size)} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.7rem' }} />
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'text.secondary',
                            }}
                          >
                            {formatDateTime(pdf.modified)}
                          </Typography>
                        </Stack>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          )}

          {/* Import the CCLI chord chart straight into the song's PDFs (CCLI songs only). */}
          {churchToolsEnabled && isCcliSong && (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <MusicNoteIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2">{LL.PDF.IMPORT_CHORDS()}</Typography>
                </Stack>
                {chordDetailLoading ? (
                  // Resolving the song's CCLI metadata (default key / availability) — show a skeleton.
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Skeleton variant="rounded" width={130} height={40} />
                    <Skeleton variant="rounded" width={100} height={40} />
                    <Skeleton variant="rounded" width={120} height={24} />
                    <Skeleton variant="rounded" width={110} height={36} />
                  </Stack>
                ) : !chordAvailable ? (
                  // No default key in the CCLI metadata → CCLI has no chord sheet; don't offer the import.
                  <Alert severity="info" sx={{ py: 0.5 }}>
                    {LL.PDF.IMPORT_CHORDS_NONE()}
                  </Alert>
                ) : (
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <InputLabel>{LL.PDF.KEY_LABEL()}</InputLabel>
                      <Select value={chordKey} label={LL.PDF.KEY_LABEL()} onChange={(e) => setChordKey(e.target.value)}>
                        {defaultKey !== '' && !MUSICAL_KEYS.includes(defaultKey) && (
                          <MenuItem value={defaultKey}>
                            {defaultKey} ({LL.PDF.CHORDS_DEFAULT()})
                          </MenuItem>
                        )}
                        {MUSICAL_KEYS.map((k) => (
                          <MenuItem key={k} value={k}>
                            {k}
                            {k === defaultKey ? ` (${LL.PDF.CHORDS_DEFAULT()})` : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <InputLabel>{LL.PDF.CHORDS_COLUMNS()}</InputLabel>
                      <Select
                        value={chordColumns}
                        label={LL.PDF.CHORDS_COLUMNS()}
                        onChange={(e) => setChordColumns(Number(e.target.value))}
                      >
                        {[1, 2, 3].map((c) => (
                          <MenuItem key={c} value={c}>
                            {c}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControlLabel
                      control={<Checkbox checked={chordDefault} onChange={(e) => setChordDefault(e.target.checked)} size="small" />}
                      label={<Typography variant="body2">{LL.PDF.MARK_DEFAULT()}</Typography>}
                      sx={{ mr: 0 }}
                    />
                    <Button
                      variant="outlined"
                      startIcon={chordLoading ? <CircularProgress size={14} /> : <DownloadIcon />}
                      onClick={handleDownloadChords}
                      disabled={chordLoading}
                    >
                      {LL.PDF.CHORDS_IMPORT()}
                    </Button>
                  </Stack>
                )}
                {chordMsg && (
                  <Alert severity={chordMsg.severity} onClose={() => setChordMsg(null)} sx={{ py: 0.5 }}>
                    {chordMsg.text}
                  </Alert>
                )}
              </Stack>
            </Paper>
          )}

          <Divider />

          {/* Import section — always available inline */}
          <Paper
            variant="outlined"
            sx={{
              p: pendingFile ? 2 : 1.5,
              borderStyle: pendingFile ? 'solid' : 'dashed',
              borderColor: dragOver ? 'primary.main' : pendingFile ? 'primary.light' : 'divider',
              bgcolor: dragOver ? 'action.hover' : 'transparent',
              transition: 'all 0.2s',
              cursor: pendingFile ? 'default' : 'pointer',
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => {
              if (!pendingFile) fileInputRef.current?.click();
            }}
          >
            {!pendingFile ? (
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <UploadIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {LL.PDF.DRAG_DROP()}
                </Typography>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    alignItems: 'center',
                  }}
                >
                  <FileIcon color="error" fontSize="small" />
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      flex: 1,
                    }}
                  >
                    {pendingFile.name}
                  </Typography>
                  <Chip label={formatFileSize(pendingFile.size)} size="small" variant="outlined" />
                  <IconButton
                    size="small"
                    onClick={() => {
                      setPendingFile(null);
                      setDetectedKey('');
                      setSelectedKey('');
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Stack>

                {detectedKey && (
                  <Alert severity="info" sx={{ py: 0.5 }}>
                    {LL.PDF.KEY_AUTODETECTED()}: <strong>{detectedKey}</strong>
                  </Alert>
                )}

                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {/* Key selector */}
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <InputLabel>{LL.PDF.KEY_LABEL()}</InputLabel>
                    <Select value={selectedKey} label={LL.PDF.KEY_LABEL()} onChange={(e) => setSelectedKey(e.target.value)}>
                      <MenuItem value="">{LL.PDF.KEY_NONE()}</MenuItem>
                      {MUSICAL_KEYS.map((k) => (
                        <MenuItem key={k} value={k}>
                          {k}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Assign to musician */}
                  {!markDefault && (
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <InputLabel>{LL.PDF.ASSIGN_MUSICIAN()}</InputLabel>
                      <Select value={assignMusician} label={LL.PDF.ASSIGN_MUSICIAN()} onChange={(e) => setAssignMusician(e.target.value)}>
                        <MenuItem value="">{LL.PDF.MUSICIAN_NONE()}</MenuItem>
                        {allMusicianNames.map((name) => (
                          <MenuItem key={name} value={name}>
                            {name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={markDefault}
                        onChange={(e) => {
                          setMarkDefault(e.target.checked);
                          if (e.target.checked) setAssignMusician('');
                        }}
                        size="small"
                      />
                    }
                    label={<Typography variant="body2">{LL.PDF.MARK_DEFAULT()}</Typography>}
                    sx={{ mr: 0 }}
                  />
                </Stack>

                {/* Target filename + upload */}
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    alignItems: 'center',
                  }}
                >
                  <Chip label={targetFilename} size="small" variant="outlined" sx={{ flex: 1 }} />
                  <Button
                    onClick={handleUpload}
                    variant="contained"
                    size="small"
                    disabled={isUploading}
                    startIcon={isUploading ? <CircularProgress size={14} /> : <UploadIcon />}
                  >
                    {isDuplicate ? LL.PDF.OVERRIDE_CONFIRM() : LL.PDF.UPLOAD()}
                  </Button>
                </Stack>

                {isDuplicate && (
                  <Alert severity="warning" sx={{ py: 0.5 }}>
                    {LL.PDF.DUPLICATE_WARNING({ filename: targetFilename })}
                  </Alert>
                )}
              </Stack>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf" hidden onChange={handleFileInput} />
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{LL.COMMON.CLOSE()}</Button>
      </DialogActions>
      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{LL.PDF.DELETE()}</DialogTitle>
        <DialogContent>
          <Typography>{LL.PDF.DELETE_CONFIRM({ filename: deleteTarget || '' })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{LL.COMMON.CANCEL()}</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={isDeleting}>
            {LL.COMMON.DELETE()}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};
