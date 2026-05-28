import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  Upload as UploadIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useListPdfsQuery, useUploadPdfMutation, useDeletePdfMutation, type PdfFileInfo } from '@/api/pdfs.api';

interface PdfDashboardProps {
  songNumber: number;
  open: boolean;
  onClose: () => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const PdfDashboard = ({ songNumber, open, onClose }: PdfDashboardProps) => {
  const { LL } = useI18nContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: pdfs = [], isLoading, isFetching } = useListPdfsQuery({ songNumber }, { skip: !open });
  const [uploadPdf, { isLoading: isUploading }] = useUploadPdfMutation();
  const [deletePdf, { isLoading: isDeleting }] = useDeletePdfMutation();

  const filteredPdfs = filter ? pdfs.filter((p) => p.filename.toLowerCase().includes(filter.toLowerCase())) : pdfs;

  const handleUpload = async (files: FileList | File[]) => {
    const formData = new FormData();
    for (const file of Array.from(files)) {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        formData.append('files[]', file);
      }
    }
    try {
      await uploadPdf({ songNumber, formData }).unwrap();
    } catch (err) {
      console.error('Failed to upload PDF:', err);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
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
            <Typography variant="h6">
              {LL.PDF.DASHBOARD()} — {LL.PDF.SONG_NUMBER({ number: String(songNumber) })}
            </Typography>
          </Stack>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {/* Search */}
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

          {/* Upload area */}
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: 'center',
              cursor: 'pointer',
              borderStyle: 'dashed',
              borderColor: dragOver ? 'primary.main' : 'divider',
              bgcolor: dragOver ? 'action.hover' : 'transparent',
              transition: 'all 0.2s',
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}
            >
              {LL.PDF.DRAG_DROP()}
            </Typography>
            {isUploading && <CircularProgress size={24} sx={{ mt: 1 }} />}
            <input ref={fileInputRef} type="file" accept=".pdf" multiple hidden onChange={handleFileInput} />
          </Paper>

          <Divider />

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
          ) : filteredPdfs.length === 0 ? (
            <Alert severity="info">{LL.PDF.NO_FILES()}</Alert>
          ) : (
            <List dense disablePadding>
              {filteredPdfs.map((pdf: PdfFileInfo) => (
                <ListItem
                  key={pdf.filename}
                  secondaryAction={
                    <Tooltip title={LL.PDF.DELETE()}>
                      <IconButton edge="end" size="small" color="error" onClick={() => setDeleteTarget(pdf.filename)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <PdfIcon fontSize="small" color="error" />
                  </ListItemIcon>
                  <ListItemText
                    primary={pdf.filename}
                    secondary={
                      <Stack direction="row" spacing={1} component="span">
                        <Chip label={formatFileSize(pdf.size)} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.7rem' }} />
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                          }}
                        >
                          {new Date(pdf.modified * 1000).toLocaleDateString()}
                        </Typography>
                      </Stack>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}

          {isFetching && !isLoading && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <CircularProgress size={20} />
            </Box>
          )}
        </Stack>
      </DialogContent>
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
