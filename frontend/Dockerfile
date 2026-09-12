# frontend/Dockerfile
FROM node:18-alpine AS build

ENV NO_UPDATE_NOTIFIER=1
ENV npm_config_update_notifier=false
ENV NPM_CONFIG_LOGLEVEL=error
ENV DISABLE_ESLINT_PLUGIN=true
ENV CI=false

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including qrcode.react
RUN npm install --no-fund --no-audit --legacy-peer-deps

# Install qrcode.react explicitly
RUN npm install qrcode.react@3.1.0 --no-fund --no-audit

# Copy source
COPY . .

# ✅ Create complete constants file with ALL values using MUI color names
# Including ROLES constants
RUN mkdir -p src/constants && \
    echo "// ============================================" > src/constants/index.js && \
    echo "// TICKET CONSTANTS - MUI Color Names" >> src/constants/index.js && \
    echo "// ============================================" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const TICKET_STATUS = {" >> src/constants/index.js && \
    echo "    ACTIVE: 'active'," >> src/constants/index.js && \
    echo "    USED: 'used'," >> src/constants/index.js && \
    echo "    CANCELLED: 'cancelled'," >> src/constants/index.js && \
    echo "    REFUNDED: 'refunded'," >> src/constants/index.js && \
    echo "    EXPIRED: 'expired'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const TICKET_STATUS_LABELS = {" >> src/constants/index.js && \
    echo "    [TICKET_STATUS.ACTIVE]: 'Active'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.USED]: 'Used'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.CANCELLED]: 'Cancelled'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.REFUNDED]: 'Refunded'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.EXPIRED]: 'Expired'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// ✅ MUI color names" >> src/constants/index.js && \
    echo "export const TICKET_STATUS_COLORS = {" >> src/constants/index.js && \
    echo "    [TICKET_STATUS.ACTIVE]: 'success'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.USED]: 'error'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.CANCELLED]: 'default'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.REFUNDED]: 'secondary'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.EXPIRED]: 'warning'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const TICKET_STATUS_ICONS = {" >> src/constants/index.js && \
    echo "    [TICKET_STATUS.ACTIVE]: '✅'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.USED]: '🔴'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.CANCELLED]: '❌'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.REFUNDED]: '🔄'," >> src/constants/index.js && \
    echo "    [TICKET_STATUS.EXPIRED]: '⏰'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const TERMINAL_TICKET_STATUSES = [" >> src/constants/index.js && \
    echo "    TICKET_STATUS.USED," >> src/constants/index.js && \
    echo "    TICKET_STATUS.CANCELLED," >> src/constants/index.js && \
    echo "    TICKET_STATUS.REFUNDED," >> src/constants/index.js && \
    echo "    TICKET_STATUS.EXPIRED," >> src/constants/index.js && \
    echo "];" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const CHECKIN_ALLOWED_STATUSES = [TICKET_STATUS.ACTIVE];" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const MODIFIABLE_TICKET_STATUSES = [TICKET_STATUS.ACTIVE];" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const TicketStatusUtils = {" >> src/constants/index.js && \
    echo "    isValid: function(status) {" >> src/constants/index.js && \
    echo "        return Object.values(TICKET_STATUS).includes(status);" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getLabel: function(status) {" >> src/constants/index.js && \
    echo "        return TICKET_STATUS_LABELS[status] || status;" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getColor: function(status) {" >> src/constants/index.js && \
    echo "        return TICKET_STATUS_COLORS[status] || 'default';" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    isTerminal: function(status) {" >> src/constants/index.js && \
    echo "        return TERMINAL_TICKET_STATUSES.includes(status);" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    canCheckIn: function(status) {" >> src/constants/index.js && \
    echo "        return CHECKIN_ALLOWED_STATUSES.includes(status);" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// ============================================" >> src/constants/index.js && \
    echo "// BOOKING CONSTANTS - MUI Color Names" >> src/constants/index.js && \
    echo "// ============================================" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const BOOKING_STATUS = {" >> src/constants/index.js && \
    echo "    PENDING: 'pending'," >> src/constants/index.js && \
    echo "    PROCESSING: 'processing'," >> src/constants/index.js && \
    echo "    PAID: 'paid'," >> src/constants/index.js && \
    echo "    CONFIRMED: 'confirmed'," >> src/constants/index.js && \
    echo "    COMPLETED: 'completed'," >> src/constants/index.js && \
    echo "    CANCELLED: 'cancelled'," >> src/constants/index.js && \
    echo "    REFUNDED: 'refunded'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const BOOKING_STATUS_LABELS = {" >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PENDING]: 'Pending'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PROCESSING]: 'Processing'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PAID]: 'Paid'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.CONFIRMED]: 'Confirmed'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.COMPLETED]: 'Completed'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.CANCELLED]: 'Cancelled'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.REFUNDED]: 'Refunded'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// ✅ MUI color names" >> src/constants/index.js && \
    echo "export const BOOKING_STATUS_COLORS = {" >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PENDING]: 'warning'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PROCESSING]: 'info'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PAID]: 'info'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.CONFIRMED]: 'success'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.COMPLETED]: 'success'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.CANCELLED]: 'error'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.REFUNDED]: 'secondary'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const BOOKING_STATUS_DOT_COLORS = {" >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PENDING]: '#f59e0b'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PROCESSING]: '#3b82f6'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PAID]: '#22c55e'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.CONFIRMED]: '#8b5cf6'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.COMPLETED]: '#10b981'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.CANCELLED]: '#ef4444'," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.REFUNDED]: '#f97316'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const BOOKING_TRANSITIONS = {" >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PENDING]: [BOOKING_STATUS.PROCESSING, BOOKING_STATUS.PAID, BOOKING_STATUS.CANCELLED]," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PROCESSING]: [BOOKING_STATUS.PAID, BOOKING_STATUS.CANCELLED]," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.PAID]: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.REFUNDED, BOOKING_STATUS.CANCELLED]," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.CONFIRMED]: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.REFUNDED, BOOKING_STATUS.CANCELLED]," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.COMPLETED]: []," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.CANCELLED]: []," >> src/constants/index.js && \
    echo "    [BOOKING_STATUS.REFUNDED]: []," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const BookingStatusUtils = {" >> src/constants/index.js && \
    echo "    isValid: function(status) {" >> src/constants/index.js && \
    echo "        return Object.values(BOOKING_STATUS).includes(status);" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getLabel: function(status) {" >> src/constants/index.js && \
    echo "        return BOOKING_STATUS_LABELS[status] || status;" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getColor: function(status) {" >> src/constants/index.js && \
    echo "        return BOOKING_STATUS_COLORS[status] || 'default';" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getDotColor: function(status) {" >> src/constants/index.js && \
    echo "        return BOOKING_STATUS_DOT_COLORS[status] || '#6b7280';" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    canTransition: function(from, to) {" >> src/constants/index.js && \
    echo "        var transitions = BOOKING_TRANSITIONS[from] || [];" >> src/constants/index.js && \
    echo "        return transitions.includes(to);" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getAvailableActions: function(status) {" >> src/constants/index.js && \
    echo "        if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.PROCESSING].includes(status)) {" >> src/constants/index.js && \
    echo "            return ['mark_payment_received', 'confirm_payment_and_issue', 'cancel'];" >> src/constants/index.js && \
    echo "        }" >> src/constants/index.js && \
    echo "        if (status === BOOKING_STATUS.PAID) {" >> src/constants/index.js && \
    echo "            return ['issue_tickets', 'refund', 'cancel'];" >> src/constants/index.js && \
    echo "        }" >> src/constants/index.js && \
    echo "        if (status === BOOKING_STATUS.CONFIRMED) {" >> src/constants/index.js && \
    echo "            return ['refund', 'cancel'];" >> src/constants/index.js && \
    echo "        }" >> src/constants/index.js && \
    echo "        return ['view_only'];" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    isTerminal: function(status) {" >> src/constants/index.js && \
    echo "        return [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REFUNDED].includes(status);" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    requiresPayment: function(status) {" >> src/constants/index.js && \
    echo "        return [BOOKING_STATUS.PENDING, BOOKING_STATUS.PROCESSING].includes(status);" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    hasTickets: function(status) {" >> src/constants/index.js && \
    echo "        return [BOOKING_STATUS.PAID, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED].includes(status);" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getOptions: function() {" >> src/constants/index.js && \
    echo "        return Object.values(BOOKING_STATUS).map(function(status) {" >> src/constants/index.js && \
    echo "            return {" >> src/constants/index.js && \
    echo "                value: status," >> src/constants/index.js && \
    echo "                label: BOOKING_STATUS_LABELS[status] || status," >> src/constants/index.js && \
    echo "            };" >> src/constants/index.js && \
    echo "        });" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// ============================================" >> src/constants/index.js && \
    echo "// EVENT CONSTANTS - MUI Color Names" >> src/constants/index.js && \
    echo "// ============================================" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// EVENT STATUS - 7 values" >> src/constants/index.js && \
    echo "export const EVENT_STATUS = {" >> src/constants/index.js && \
    echo "    DRAFT: 'draft'," >> src/constants/index.js && \
    echo "    PUBLISHED: 'published'," >> src/constants/index.js && \
    echo "    ACTIVE: 'active'," >> src/constants/index.js && \
    echo "    CANCELLED: 'cancelled'," >> src/constants/index.js && \
    echo "    COMPLETED: 'completed'," >> src/constants/index.js && \
    echo "    SOLD_OUT: 'sold_out'," >> src/constants/index.js && \
    echo "    POSTPONED: 'postponed'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const EVENT_STATUS_LABELS = {" >> src/constants/index.js && \
    echo "    [EVENT_STATUS.DRAFT]: 'Draft'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.PUBLISHED]: 'Published'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.ACTIVE]: 'Active'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.CANCELLED]: 'Cancelled'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.COMPLETED]: 'Completed'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.SOLD_OUT]: 'Sold Out'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.POSTPONED]: 'Postponed'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// ✅ MUI color names" >> src/constants/index.js && \
    echo "export const EVENT_STATUS_COLORS = {" >> src/constants/index.js && \
    echo "    [EVENT_STATUS.DRAFT]: 'default'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.PUBLISHED]: 'info'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.ACTIVE]: 'success'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.CANCELLED]: 'error'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.COMPLETED]: 'secondary'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.SOLD_OUT]: 'warning'," >> src/constants/index.js && \
    echo "    [EVENT_STATUS.POSTPONED]: 'warning'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// EVENT TYPE - 5 values" >> src/constants/index.js && \
    echo "export const EVENT_TYPE = {" >> src/constants/index.js && \
    echo "    SINGLE: 'single'," >> src/constants/index.js && \
    echo "    MULTI_DAY: 'multi_day'," >> src/constants/index.js && \
    echo "    RECURRING: 'recurring'," >> src/constants/index.js && \
    echo "    VIRTUAL: 'virtual'," >> src/constants/index.js && \
    echo "    HYBRID: 'hybrid'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const EVENT_TYPE_LABELS = {" >> src/constants/index.js && \
    echo "    [EVENT_TYPE.SINGLE]: 'Single Day'," >> src/constants/index.js && \
    echo "    [EVENT_TYPE.MULTI_DAY]: 'Multi Day'," >> src/constants/index.js && \
    echo "    [EVENT_TYPE.RECURRING]: 'Recurring'," >> src/constants/index.js && \
    echo "    [EVENT_TYPE.VIRTUAL]: 'Virtual'," >> src/constants/index.js && \
    echo "    [EVENT_TYPE.HYBRID]: 'Hybrid'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// EVENT CATEGORY - 12 values" >> src/constants/index.js && \
    echo "export const EVENT_CATEGORY = {" >> src/constants/index.js && \
    echo "    CONCERT: 'concert'," >> src/constants/index.js && \
    echo "    SPORTS: 'sports'," >> src/constants/index.js && \
    echo "    THEATER: 'theater'," >> src/constants/index.js && \
    echo "    CONFERENCE: 'conference'," >> src/constants/index.js && \
    echo "    WORKSHOP: 'workshop'," >> src/constants/index.js && \
    echo "    PARTY: 'party'," >> src/constants/index.js && \
    echo "    DINING: 'dining'," >> src/constants/index.js && \
    echo "    FESTIVAL: 'festival'," >> src/constants/index.js && \
    echo "    EXHIBITION: 'exhibition'," >> src/constants/index.js && \
    echo "    COMMUNITY: 'community'," >> src/constants/index.js && \
    echo "    VIRTUAL: 'virtual'," >> src/constants/index.js && \
    echo "    OTHER: 'other'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const EVENT_CATEGORY_LABELS = {" >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.CONCERT]: 'Concert'," >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.SPORTS]: 'Sports'," >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.THEATER]: 'Theater'," >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.CONFERENCE]: 'Conference'," >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.WORKSHOP]: 'Workshop'," >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.PARTY]: 'Party'," >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.DINING]: 'Dining'," >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.FESTIVAL]: 'Festival'," >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.EXHIBITION]: 'Exhibition'," >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.COMMUNITY]: 'Community'," >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.VIRTUAL]: 'Virtual'," >> src/constants/index.js && \
    echo "    [EVENT_CATEGORY.OTHER]: 'Other'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// EVENT UTILITIES" >> src/constants/index.js && \
    echo "export const EventStatusUtils = {" >> src/constants/index.js && \
    echo "    isValid: function(status) {" >> src/constants/index.js && \
    echo "        return Object.values(EVENT_STATUS).includes(status);" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getLabel: function(status) {" >> src/constants/index.js && \
    echo "        return EVENT_STATUS_LABELS[status] || status;" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getColor: function(status) {" >> src/constants/index.js && \
    echo "        return EVENT_STATUS_COLORS[status] || 'default';" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    isActive: function(status) {" >> src/constants/index.js && \
    echo "        return status === EVENT_STATUS.ACTIVE || status === EVENT_STATUS.PUBLISHED;" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    isTerminal: function(status) {" >> src/constants/index.js && \
    echo "        return [EVENT_STATUS.COMPLETED, EVENT_STATUS.CANCELLED].includes(status);" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    isBookable: function(status) {" >> src/constants/index.js && \
    echo "        return status === EVENT_STATUS.ACTIVE || status === EVENT_STATUS.PUBLISHED;" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// ============================================" >> src/constants/index.js && \
    echo "// EVENT TEMPLATE TYPES" >> src/constants/index.js && \
    echo "// ============================================" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const EVENT_TEMPLATE_TYPE = {" >> src/constants/index.js && \
    echo "    ANNOUNCEMENT: 'announcement'," >> src/constants/index.js && \
    echo "    TICKET: 'ticket'," >> src/constants/index.js && \
    echo "    FLYER: 'flyer'," >> src/constants/index.js && \
    echo "    SOCIAL: 'social'," >> src/constants/index.js && \
    echo "    INVITE: 'invite'," >> src/constants/index.js && \
    echo "    CERTIFICATE: 'certificate'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const EVENT_TEMPLATE_TYPE_LABELS = {" >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.ANNOUNCEMENT]: 'Announcement'," >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.TICKET]: 'Ticket'," >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.FLYER]: 'Flyer'," >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.SOCIAL]: 'Social Media'," >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.INVITE]: 'Invitation'," >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.CERTIFICATE]: 'Certificate'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const EVENT_TEMPLATE_TYPE_ICONS = {" >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.ANNOUNCEMENT]: '📢'," >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.TICKET]: '🎫'," >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.FLYER]: '📄'," >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.SOCIAL]: '📱'," >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.INVITE]: '💌'," >> src/constants/index.js && \
    echo "    [EVENT_TEMPLATE_TYPE.CERTIFICATE]: '🏆'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const EventTemplateTypeUtils = {" >> src/constants/index.js && \
    echo "    isValid: function(type) {" >> src/constants/index.js && \
    echo "        return Object.values(EVENT_TEMPLATE_TYPE).includes(type);" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getLabel: function(type) {" >> src/constants/index.js && \
    echo "        return EVENT_TEMPLATE_TYPE_LABELS[type] || type;" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getIcon: function(type) {" >> src/constants/index.js && \
    echo "        return EVENT_TEMPLATE_TYPE_ICONS[type] || '📄';" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getOptions: function() {" >> src/constants/index.js && \
    echo "        return Object.values(EVENT_TEMPLATE_TYPE).map(function(type) {" >> src/constants/index.js && \
    echo "            return {" >> src/constants/index.js && \
    echo "                value: type," >> src/constants/index.js && \
    echo "                label: EVENT_TEMPLATE_TYPE_LABELS[type] || type," >> src/constants/index.js && \
    echo "                icon: EVENT_TEMPLATE_TYPE_ICONS[type] || '📄'," >> src/constants/index.js && \
    echo "            };" >> src/constants/index.js && \
    echo "        });" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// ============================================" >> src/constants/index.js && \
    echo "// ROLES CONSTANTS" >> src/constants/index.js && \
    echo "// ============================================" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const ROLES = {" >> src/constants/index.js && \
    echo "    SUPER_ADMIN: 'super_admin'," >> src/constants/index.js && \
    echo "    ADMIN: 'admin'," >> src/constants/index.js && \
    echo "    ORGANIZER: 'organizer'," >> src/constants/index.js && \
    echo "    USER: 'user'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const ROLE_LABELS = {" >> src/constants/index.js && \
    echo "    [ROLES.SUPER_ADMIN]: 'Super Admin'," >> src/constants/index.js && \
    echo "    [ROLES.ADMIN]: 'Admin'," >> src/constants/index.js && \
    echo "    [ROLES.ORGANIZER]: 'Organizer'," >> src/constants/index.js && \
    echo "    [ROLES.USER]: 'User'," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const ROLE_HIERARCHY = {" >> src/constants/index.js && \
    echo "    [ROLES.SUPER_ADMIN]: 4," >> src/constants/index.js && \
    echo "    [ROLES.ADMIN]: 3," >> src/constants/index.js && \
    echo "    [ROLES.ORGANIZER]: 2," >> src/constants/index.js && \
    echo "    [ROLES.USER]: 1," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const ROLE_PERMISSIONS = {" >> src/constants/index.js && \
    echo "    [ROLES.SUPER_ADMIN]: {" >> src/constants/index.js && \
    echo "        canManageUsers: true," >> src/constants/index.js && \
    echo "        canManageAllEvents: true," >> src/constants/index.js && \
    echo "        canManageAllBookings: true," >> src/constants/index.js && \
    echo "        canManageOrganizers: true," >> src/constants/index.js && \
    echo "        canManageVenues: true," >> src/constants/index.js && \
    echo "        canViewAnalytics: true," >> src/constants/index.js && \
    echo "        canManageSystem: true," >> src/constants/index.js && \
    echo "        canManageDiscounts: true," >> src/constants/index.js && \
    echo "        canAccessScanner: true," >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    [ROLES.ADMIN]: {" >> src/constants/index.js && \
    echo "        canManageUsers: true," >> src/constants/index.js && \
    echo "        canManageAllEvents: true," >> src/constants/index.js && \
    echo "        canManageAllBookings: true," >> src/constants/index.js && \
    echo "        canManageOrganizers: false," >> src/constants/index.js && \
    echo "        canManageVenues: true," >> src/constants/index.js && \
    echo "        canViewAnalytics: true," >> src/constants/index.js && \
    echo "        canManageSystem: false," >> src/constants/index.js && \
    echo "        canManageDiscounts: true," >> src/constants/index.js && \
    echo "        canAccessScanner: true," >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    [ROLES.ORGANIZER]: {" >> src/constants/index.js && \
    echo "        canManageUsers: false," >> src/constants/index.js && \
    echo "        canManageAllEvents: false," >> src/constants/index.js && \
    echo "        canManageAllBookings: false," >> src/constants/index.js && \
    echo "        canManageOrganizers: false," >> src/constants/index.js && \
    echo "        canManageVenues: false," >> src/constants/index.js && \
    echo "        canViewAnalytics: true," >> src/constants/index.js && \
    echo "        canManageSystem: false," >> src/constants/index.js && \
    echo "        canManageDiscounts: true," >> src/constants/index.js && \
    echo "        canAccessScanner: false," >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    [ROLES.USER]: {" >> src/constants/index.js && \
    echo "        canManageUsers: false," >> src/constants/index.js && \
    echo "        canManageAllEvents: false," >> src/constants/index.js && \
    echo "        canManageAllBookings: false," >> src/constants/index.js && \
    echo "        canManageOrganizers: false," >> src/constants/index.js && \
    echo "        canManageVenues: false," >> src/constants/index.js && \
    echo "        canViewAnalytics: false," >> src/constants/index.js && \
    echo "        canManageSystem: false," >> src/constants/index.js && \
    echo "        canManageDiscounts: false," >> src/constants/index.js && \
    echo "        canAccessScanner: false," >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export const RoleUtils = {" >> src/constants/index.js && \
    echo "    getLabel: function(role) {" >> src/constants/index.js && \
    echo "        return ROLE_LABELS[role] || role;" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getLevel: function(role) {" >> src/constants/index.js && \
    echo "        return ROLE_HIERARCHY[role] || 0;" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    hasPermission: function(role, permission) {" >> src/constants/index.js && \
    echo "        var perms = ROLE_PERMISSIONS[role];" >> src/constants/index.js && \
    echo "        return perms ? perms[permission] || false : false;" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    isAtLeast: function(role, minRole) {" >> src/constants/index.js && \
    echo "        return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "    getAvailableRoles: function(currentRole) {" >> src/constants/index.js && \
    echo "        var currentLevel = ROLE_HIERARCHY[currentRole] || 0;" >> src/constants/index.js && \
    echo "        return Object.keys(ROLE_HIERARCHY).filter(function(role) {" >> src/constants/index.js && \
    echo "            return ROLE_HIERARCHY[role] <= currentLevel;" >> src/constants/index.js && \
    echo "        });" >> src/constants/index.js && \
    echo "    }," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "// ============================================" >> src/constants/index.js && \
    echo "// DEFAULT EXPORT" >> src/constants/index.js && \
    echo "// ============================================" >> src/constants/index.js && \
    echo "" >> src/constants/index.js && \
    echo "export default {" >> src/constants/index.js && \
    echo "    TICKET_STATUS," >> src/constants/index.js && \
    echo "    TICKET_STATUS_LABELS," >> src/constants/index.js && \
    echo "    TICKET_STATUS_COLORS," >> src/constants/index.js && \
    echo "    TICKET_STATUS_ICONS," >> src/constants/index.js && \
    echo "    TERMINAL_TICKET_STATUSES," >> src/constants/index.js && \
    echo "    CHECKIN_ALLOWED_STATUSES," >> src/constants/index.js && \
    echo "    MODIFIABLE_TICKET_STATUSES," >> src/constants/index.js && \
    echo "    TicketStatusUtils," >> src/constants/index.js && \
    echo "    BOOKING_STATUS," >> src/constants/index.js && \
    echo "    BOOKING_STATUS_LABELS," >> src/constants/index.js && \
    echo "    BOOKING_STATUS_COLORS," >> src/constants/index.js && \
    echo "    BOOKING_STATUS_DOT_COLORS," >> src/constants/index.js && \
    echo "    BOOKING_TRANSITIONS," >> src/constants/index.js && \
    echo "    BookingStatusUtils," >> src/constants/index.js && \
    echo "    EVENT_STATUS," >> src/constants/index.js && \
    echo "    EVENT_STATUS_LABELS," >> src/constants/index.js && \
    echo "    EVENT_STATUS_COLORS," >> src/constants/index.js && \
    echo "    EVENT_TYPE," >> src/constants/index.js && \
    echo "    EVENT_TYPE_LABELS," >> src/constants/index.js && \
    echo "    EVENT_CATEGORY," >> src/constants/index.js && \
    echo "    EVENT_CATEGORY_LABELS," >> src/constants/index.js && \
    echo "    EventStatusUtils," >> src/constants/index.js && \
    echo "    EVENT_TEMPLATE_TYPE," >> src/constants/index.js && \
    echo "    EVENT_TEMPLATE_TYPE_LABELS," >> src/constants/index.js && \
    echo "    EVENT_TEMPLATE_TYPE_ICONS," >> src/constants/index.js && \
    echo "    EventTemplateTypeUtils," >> src/constants/index.js && \
    echo "    ROLES," >> src/constants/index.js && \
    echo "    ROLE_LABELS," >> src/constants/index.js && \
    echo "    ROLE_HIERARCHY," >> src/constants/index.js && \
    echo "    ROLE_PERMISSIONS," >> src/constants/index.js && \
    echo "    RoleUtils," >> src/constants/index.js && \
    echo "};" >> src/constants/index.js

# Build
RUN npm run build --no-fund --no-audit

# Production stage
FROM nginx:alpine

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]