import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '~components/ui/dialog';
import { SettingsContainer } from './settings-container';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full w-[95vw] h-[90vh] p-0 bg-gray-900 border-gray-700 overflow-hidden">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <SettingsContainer />
      </DialogContent>
    </Dialog>
  );
};
