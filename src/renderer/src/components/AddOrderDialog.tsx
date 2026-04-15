import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';

type Props = {
  open: boolean;
  onClose: () => void;
  orders: { [key: string]: string[] };
  onCreate: (name: string) => void;
};

const AddOrderDialog = ({ open, onClose, orders, onCreate }: Props) => {
  const { LL } = useI18nContext();
  const [newOrderName, setNewOrderName] = useState('');

  const trimmed = newOrderName.trim();
  const exists: boolean = !!trimmed && !!orders[trimmed];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{LL.SONG_EDITOR_ADD_ORDER_TITLE()}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label={LL.SONG_EDITOR_ORDER_NAME_LABEL()}
          fullWidth
          variant="outlined"
          value={newOrderName}
          onChange={(e) => setNewOrderName(e.target.value)}
          placeholder={LL.SONG_EDITOR_ORDER_NAME_PLACEHOLDER()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!trimmed || exists) return;
              onCreate(trimmed);
              setNewOrderName('');
            }
          }}
        />
        {trimmed && exists && (
          <Typography color="error" variant="caption" sx={{ mt: 1, display: 'block' }}>
            {LL.SONG_EDITOR_ORDER_EXISTS()}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            onClose();
            setNewOrderName('');
          }}
        >
          {LL.CANCEL()}
        </Button>
        <Button
          onClick={() => {
            if (!trimmed || exists) return;
            onCreate(trimmed);
            setNewOrderName('');
          }}
          variant="contained"
          disabled={!trimmed || exists}
        >
          {LL.ADD()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddOrderDialog;
