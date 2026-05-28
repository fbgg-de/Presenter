import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';

type Props = {
  open: boolean;
  onClose: () => void;
  orderName: string;
  onDelete: () => void;
};

const DeleteOrderDialog = ({ open, onClose, orderName, onDelete }: Props) => {
  const { LL } = useI18nContext();

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{LL.SONG_EDITOR.DELETE_ORDER_TITLE()}</DialogTitle>
      <DialogContent>
        <Typography>{LL.SONG_EDITOR.DELETE_ORDER_MESSAGE({ name: orderName })}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button onClick={onDelete} color="error" variant="contained">
          {LL.COMMON.DELETE()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteOrderDialog;
