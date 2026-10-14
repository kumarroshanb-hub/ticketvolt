// frontend/src/features/events/useEventTemplates.js
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { EventTemplateTypeUtils } from '../../constants';

const emptyUpload = {
    name: '',
    description: '',
    template_type_id: '',
    image: null,
    is_default: false,
};

export const useEventTemplates = (eventId) => {
    const [templates, setTemplates] = useState({});
    const [templateTypes] = useState(() => EventTemplateTypeUtils.getOptions());
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [uploadForm, setUploadForm] = useState(emptyUpload);
    const [uploading, setUploading] = useState(false);

    const loadTemplates = useCallback(async () => {
        if (!eventId) return;
        try {
            const res = await api.get(`/templates/by_type/?event_id=${eventId}`);
            setTemplates(res.data || {});
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to load templates:', err);
        }
    }, [eventId]);

    useEffect(() => {
        loadTemplates();
    }, [loadTemplates]);

    const openUpload = useCallback((templateTypeId) => {
        setUploadForm({ ...emptyUpload, template_type_id: templateTypeId });
        setUploadDialogOpen(true);
    }, []);

    const closeUpload = useCallback(() => {
        setUploadDialogOpen(false);
        setUploadForm(emptyUpload);
    }, []);

    const uploadTemplate = useCallback(async () => {
        if (!uploadForm.image || !uploadForm.template_type_id) {
            toast.error('Please select an image and template type');
            return;
        }
        if (!eventId) {
            toast.error('Please save the event first before uploading templates');
            return;
        }

        setUploading(true);
        const fd = new FormData();
        fd.append('image', uploadForm.image);
        fd.append('event_id', eventId);
        fd.append('template_type_id', uploadForm.template_type_id);
        fd.append('name', uploadForm.name || 'Template');
        fd.append('description', uploadForm.description || '');
        fd.append('is_default', uploadForm.is_default ? 'true' : 'false');

        try {
            await api.post('/templates/upload/', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('Template uploaded successfully!');
            closeUpload();
            await loadTemplates();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Upload error:', err);
            toast.error(err.response?.data?.error || 'Failed to upload template');
        } finally {
            setUploading(false);
        }
    }, [uploadForm, eventId, closeUpload, loadTemplates]);

    const deleteTemplate = useCallback(
        async (templateId, templateName) => {
            if (!window.confirm(`Are you sure you want to delete "${templateName}"?`)) return;
            try {
                await api.delete(`/templates/${templateId}/`);
                toast.success('Template deleted');
                await loadTemplates();
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Delete error:', err);
                toast.error('Failed to delete template');
            }
        },
        [loadTemplates]
    );

    const setDefaultTemplate = useCallback(
        async (templateId) => {
            try {
                await api.post(`/templates/${templateId}/set_default/`);
                toast.success('Default template updated');
                await loadTemplates();
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Set default error:', err);
                toast.error('Failed to set default template');
            }
        },
        [loadTemplates]
    );

    return {
        templates,
        templateTypes,
        uploadDialogOpen,
        uploadForm,
        setUploadForm,
        uploading,
        openUpload,
        closeUpload,
        uploadTemplate,
        deleteTemplate,
        setDefaultTemplate,
    };
};