import { useState, useRef, useCallback, useMemo, type DragEvent, type ChangeEvent } from 'react';
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
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useListPdfsQuery, useUploadPdfMutation, useDeletePdfMutation, useRenamePdfMutation, type PdfFileInfo } from '@/api/pdfs.api';
import { MUSICAL_KEYS } from '@/utils/orderKeyUtils';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (ts: number): string => {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

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
}

export const PdfUploadModal = ({
  songNumber,
  open,
  onClose,
  musicianNames = [],
  selectedPdf,
  onSelectPdf,
  onOpenAreaMapping,
}: PdfUploadModalProps) => {
  const { LL } = useI18nContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete PDF:', err);
    }
  };

  const handleSetDefault = async (pdf: PdfFileInfo) => {
    const key = detectKeyFromFilename(pdf.filename);
    const newName = key ? `Default-${key}.pdf` : 'Default.pdf';
    if (pdf.filename === newName) return;
    try {
      await renamePdf({ songNumber, oldName: pdf.filename, newName }).unwrap();
    } catch (err) {
      console.error('Failed to rename PDF:', err);
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
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <PdfIcon />
            <Typography variant="h6">{LL.PDF_MANAGE_TITLE()}</Typography>
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
              placeholder={LL.PDF_SEARCH()}
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
            <Box display="flex" justifyContent="center" p={2}>
              <CircularProgress />
            </Box>
          ) : filteredPdfs.length === 0 && !filter ? (
            <Alert severity="info">{LL.PDF_NO_FILES()}</Alert>
          ) : filteredPdfs.length === 0 ? (
            <Alert severity="info">{LL.PDF_NO_FILES()}</Alert>
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
                          <Tooltip title={LL.PDF_SELECT_FILE()}>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPdf?.(pdf.filename);
                              }}
                            >
                              <ActiveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {/* Block area mapping */}
                        {onOpenAreaMapping && (
                          <Tooltip title={LL.MUSICIAN_AREA_MAPPING()}>
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
                          <Tooltip title={LL.PDF_SET_DEFAULT()}>
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
                        <Tooltip title={LL.PDF_DELETE()}>
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
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography variant="body2" fontWeight={isActive ? 700 : 400}>
                            {pdf.filename}
                          </Typography>
                          {isDefault && (
                            <Chip
                              icon={<StarIcon sx={{ fontSize: '0.8rem !important' }} />}
                              label={LL.PDF_IS_DEFAULT()}
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
                          <Typography variant="caption" color="text.secondary">
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
              <Stack direction="row" alignItems="center" spacing={1} justifyContent="center">
                <UploadIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {LL.PDF_DRAG_DROP()}
                </Typography>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <FileIcon color="error" fontSize="small" />
                  <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
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
                    {LL.PDF_KEY_AUTODETECTED()}: <strong>{detectedKey}</strong>
                  </Alert>
                )}

                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {/* Key selector */}
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <InputLabel>{LL.PDF_KEY_LABEL()}</InputLabel>
                    <Select value={selectedKey} label={LL.PDF_KEY_LABEL()} onChange={(e) => setSelectedKey(e.target.value)}>
                      <MenuItem value="">{LL.PDF_KEY_NONE()}</MenuItem>
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
                      <InputLabel>{LL.PDF_ASSIGN_MUSICIAN()}</InputLabel>
                      <Select value={assignMusician} label={LL.PDF_ASSIGN_MUSICIAN()} onChange={(e) => setAssignMusician(e.target.value)}>
                        <MenuItem value="">{LL.PDF_MUSICIAN_NONE()}</MenuItem>
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
                    label={<Typography variant="body2">{LL.PDF_MARK_DEFAULT()}</Typography>}
                    sx={{ mr: 0 }}
                  />
                </Stack>

                {/* Target filename + upload */}
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Chip label={targetFilename} size="small" variant="outlined" sx={{ flex: 1 }} />
                  <Button
                    onClick={handleUpload}
                    variant="contained"
                    size="small"
                    disabled={isUploading}
                    startIcon={isUploading ? <CircularProgress size={14} /> : <UploadIcon />}
                  >
                    {isDuplicate ? LL.PDF_OVERRIDE_CONFIRM() : LL.PDF_UPLOAD()}
                  </Button>
                </Stack>

                {isDuplicate && (
                  <Alert severity="warning" sx={{ py: 0.5 }}>
                    {LL.PDF_DUPLICATE_WARNING({ filename: targetFilename })}
                  </Alert>
                )}
              </Stack>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf" hidden onChange={handleFileInput} />
          </Paper>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>{LL.CLOSE()}</Button>
      </DialogActions>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{LL.PDF_DELETE()}</DialogTitle>
        <DialogContent>
          <Typography>{LL.PDF_DELETE_CONFIRM({ filename: deleteTarget || '' })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{LL.CANCEL()}</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={isDeleting}>
            {LL.DELETE()}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};
