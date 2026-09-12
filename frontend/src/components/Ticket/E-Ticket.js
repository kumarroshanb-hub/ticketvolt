// frontend/src/components/Ticket/E-Ticket.js
import React, { useRef, useState } from 'react';
import styled from 'styled-components';
import { QRCodeSVG } from 'qrcode.react';
import {
    Event as EventIcon,
    LocationOn as LocationIcon,
    AccessTime as AccessTimeIcon,
    ConfirmationNumber as TicketIcon,
    Person as PersonIcon,
    LocalOffer as LocalOfferIcon,
    CalendarToday as CalendarIcon,
    NavigateBefore as NavigateBeforeIcon,
    NavigateNext as NavigateNextIcon,
} from '@mui/icons-material';
import { Button, Box, Chip, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { toast } from 'react-toastify';

// ============ STYLED COMPONENTS ============

const TicketContainer = styled.div`
    max-width: 420px;
    width: 100%;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    transition: all 0.3s ease;

    @media (hover: hover) {
        &:hover {
            box-shadow: 0 24px 72px rgba(79, 70, 229, 0.2);
            transform: translateY(-4px);
        }
    }
`;

const TicketHeader = styled.div`
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    padding: 24px 28px;
    color: white;
    position: relative;
    overflow: hidden;

    @media (max-width: 480px) {
        padding: 18px 20px;
    }

    &::before {
        content: '';
        position: absolute;
        top: -50%;
        right: -20%;
        width: 200px;
        height: 200px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 50%;
    }

    &::after {
        content: '';
        position: absolute;
        bottom: -40%;
        left: -10%;
        width: 150px;
        height: 150px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 50%;
    }
`;

const BrandName = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
    position: relative;
    z-index: 1;

    .brand-icon {
        width: 36px;
        height: 36px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 18px;
        backdrop-filter: blur(10px);
    }

    .brand-text {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 0.5px;
    }

    .brand-sub {
        font-size: 11px;
        opacity: 0.8;
        font-weight: 400;
        margin-left: 4px;
    }
`;

const TicketType = styled.div`
    position: relative;
    z-index: 1;
    font-size: 13px;
    opacity: 0.9;
    margin-top: 4px;
    font-weight: 500;
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const TicketCounter = styled.span`
    background: rgba(255, 255, 255, 0.2);
    padding: 2px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
`;

const QRCodeSection = styled.div`
    padding: 24px 28px;
    background: #f8fafc;
    display: flex;
    align-items: center;
    gap: 20px;
    border-bottom: 2px dashed #e2e8f0;

    @media (max-width: 480px) {
        padding: 18px 20px;
        gap: 14px;
    }
`;

const QRWrapper = styled.div`
    background: white;
    padding: 12px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    flex-shrink: 0;

    @media (max-width: 400px) {
        padding: 8px;
    }

    canvas, svg {
        display: block;
        width: 100px;
        height: 100px;

        @media (max-width: 400px) {
            width: 80px;
            height: 80px;
        }
    }
`;

const QRInfo = styled.div`
    flex: 1;
    min-width: 0;

    .qr-title {
        font-size: 12px;
        color: #64748b;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
    }

    .qr-sub {
        font-size: 12px;
        color: #94a3b8;
    }

    .ticket-number {
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
        font-family: 'Courier New', monospace;
        margin-top: 4px;
        letter-spacing: 0.5px;
        word-break: break-all;
    }
`;

const PerforatedEdge = styled.div`
    height: 20px;
    background: repeating-linear-gradient(
        90deg,
        transparent,
        transparent 8px,
        #e2e8f0 8px,
        #e2e8f0 10px
    );
    position: relative;

    &::before,
    &::after {
        content: '✂';
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        font-size: 14px;
        color: #94a3b8;
        opacity: 0.5;
    }

    &::before {
        left: 10px;
    }

    &::after {
        right: 10px;
    }
`;

const DetailsSection = styled.div`
    padding: 20px 28px;

    @media (max-width: 480px) {
        padding: 16px 20px;
    }
`;

const EventTitle = styled.h2`
    font-size: 20px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 4px 0;
    line-height: 1.3;
`;

const EventSubtitle = styled.div`
    font-size: 14px;
    color: #64748b;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
`;

const DetailGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 20px;

    @media (max-width: 480px) {
        grid-template-columns: 1fr;
        gap: 10px;
    }
`;

const DetailItem = styled.div`
    min-width: 0;

    .label {
        font-size: 11px;
        color: #94a3b8;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .value {
        font-size: 14px;
        color: #0f172a;
        font-weight: 600;
        word-break: break-word;
    }

    .value-sm {
        font-size: 13px;
        color: #334155;
        font-weight: 500;
        word-break: break-word;
    }
`;

const DividerLine = styled.div`
    height: 1px;
    background: #e2e8f0;
    margin: 16px 0;
`;

const TicketFooter = styled.div`
    padding: 16px 28px;
    background: #f8fafc;
    border-top: 2px dashed #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: #94a3b8;
    flex-wrap: wrap;
    gap: 8px;

    @media (max-width: 480px) {
        padding: 14px 20px;
        font-size: 11px;
    }

    .footer-item {
        display: flex;
        align-items: center;
        gap: 6px;
    }
`;

const NavigationControls = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 8px 28px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;

    @media (max-width: 480px) {
        padding: 8px 20px;
    }
`;

const NavButton = styled(IconButton)`
    width: 44px;
    height: 44px;
    border: 1px solid #e2e8f0;
    border-radius: 50%;
    color: #475569;

    &:hover {
        background: #eef2ff;
        border-color: #4f46e5;
        color: #4f46e5;
    }

    &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
`;

const TicketIndicator = styled.div`
    display: flex;
    gap: 6px;
    align-items: center;
`;

const Dot = styled.span`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${props => props.active ? '#4f46e5' : '#e2e8f0'};
    transition: all 0.3s ease;
`;

// ============ HELPER FUNCTIONS ============

const generateQRData = (ticket) => {
    if (!ticket) return '';

    const data = {
        code: ticket.unique_code,
        name: ticket.attendee_name ? ticket.attendee_name.substring(0, 20) : 'Guest'
    };

    let jsonStr = JSON.stringify(data);

    if (jsonStr.length > 200) {
        return ticket.unique_code || 'TICKET';
    }

    return jsonStr;
};

const getQRValue = (ticket, qrData) => {
    if (qrData) {
        if (typeof qrData === 'string' && qrData.length > 200) {
            return qrData.substring(0, 200);
        }
        return qrData;
    }

    if (ticket) {
        return generateQRData(ticket);
    }

    return 'TICKET';
};

// ============ MAIN COMPONENT ============

const Ticket = ({
    booking = null,
    event = null,
    tickets = [],
    ticket = null,
    qrData = null,
    showActions = true,
    showNavigation = true,
    onDownload = null,
    onPrint = null,
    onEmail = null,
}) => {
    const ticketRef = useRef();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [currentIndex, setCurrentIndex] = useState(0);

    // Get all tickets (support both single ticket and array)
    const allTickets = tickets.length > 0 ? tickets : (ticket ? [ticket] : []);
    const currentTicket = allTickets[currentIndex] || null;
    const totalTickets = allTickets.length;
    const hasMultipleTickets = totalTickets > 1;

    // Extract data from props
    const eventTitle = event?.title || booking?.event_title || 'Event';
    const eventType = event?.event_type || booking?.event_type || 'General';

    const ticketCode = currentTicket?.unique_code || booking?.booking_reference || 'TIX-0000';
    const attendeeName = currentTicket?.attendee_name || booking?.customer_name || 'Guest';
    const attendeeEmail = booking?.customer_email || '';
    const attendeePhone = booking?.customer_phone || '';

    const formatDate = (dateStr) => {
        if (!dateStr) return 'TBD';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return 'TBD';
        const date = new Date(dateStr);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const eventDate = event?.start_date ? formatDate(event.start_date) : 'TBD';
    const eventTime = event?.start_date ? formatTime(event.start_date) : 'TBD';
    const venueName = event?.venue?.name || booking?.venue_name || 'Venue';
    const venueAddress = event?.venue?.address || booking?.venue_address || '';
    const tierName = currentTicket?.tier_name || booking?.tier_name || 'General';
    const price = currentTicket?.price || booking?.total_amount || 0;
    const seatInfo = currentTicket?.seat || booking?.seat || '';
    const transactionId = booking?.transaction_id || booking?.booking_reference || '';
    const orderNumber = booking?.id || '';
    const status = currentTicket?.status || booking?.status || 'active';

    const qrValue = getQRValue(currentTicket, qrData);

    const handleEmail = () => {
        console.log('📧 handleEmail called - currentTicket:', currentTicket);

        if (currentTicket) {
            const ticketId = currentTicket.unique_code || currentTicket.id || currentTicket.ticket_id;

            console.log('📧 Ticket ID from unique_code:', ticketId);

            if (ticketId && onEmail) {
                onEmail({ ...currentTicket, id: ticketId }, booking);
            } else if (onEmail) {
                onEmail(currentTicket, booking);
            } else {
                toast.success('Ticket sent to email!');
            }
        } else {
            console.error('❌ No current ticket found');
            toast.error('No valid ticket found');
        }
    };

    const handleNext = () => {
        if (currentIndex < totalTickets - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    const handleDownload = () => {
        if (onDownload) {
            onDownload(currentTicket, booking);
        } else {
            toast.success('Ticket downloaded!');
        }
    };

    const handlePrint = () => {
        if (onPrint) {
            onPrint(currentTicket, booking);
        } else {
            window.print();
        }
    };

    const getStatusColor = (status) => {
        const colors = {
            active: 'success',
            used: 'error',
            cancelled: 'default',
            expired: 'warning',
            refunded: 'secondary',
        };
        return colors[status] || 'default';
    };

    return (
        <TicketContainer ref={ticketRef}>
            <TicketHeader>
                <BrandName>
                    <div className="brand-icon">T</div>
                    <div>
                        <span className="brand-text">Ticket<span style={{ fontWeight: 400 }}>Voult</span></span>
                        <span className="brand-sub">• e-Ticket</span>
                    </div>
                </BrandName>
                <TicketType>
                    <span>{eventType?.toUpperCase() || 'GENERAL ADMISSION'}</span>
                    {hasMultipleTickets && (
                        <TicketCounter>
                            {currentIndex + 1} / {totalTickets}
                        </TicketCounter>
                    )}
                </TicketType>
            </TicketHeader>

            <QRCodeSection>
                <QRWrapper>
                    {qrValue ? (
                        <QRCodeSVG
                            value={qrValue}
                            size={isMobile ? 80 : 100}
                            level="L"
                            includeMargin={true}
                            bgColor="#ffffff"
                            fgColor="#0f172a"
                        />
                    ) : (
                        <Box sx={{
                            width: isMobile ? 80 : 100,
                            height: isMobile ? 80 : 100,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#f1f5f9',
                            borderRadius: '8px',
                            color: '#94a3b8'
                        }}>
                            <TicketIcon sx={{ fontSize: 40 }} />
                        </Box>
                    )}
                </QRWrapper>
                <QRInfo>
                    <div className="qr-title">
                        {hasMultipleTickets ? `Ticket ${currentIndex + 1} of ${totalTickets}` : 'Online ticketing is completed'}
                    </div>
                    <div className="qr-sub">Please show this QR code for admission</div>
                    <div className="ticket-number">{ticketCode}</div>
                    <div className="qr-sub" style={{ marginTop: 4 }}>
                        <strong>Attendee:</strong> {attendeeName}
                    </div>
                </QRInfo>
            </QRCodeSection>

            <PerforatedEdge />

            <DetailsSection>
                <EventTitle>{eventTitle}</EventTitle>
                <EventSubtitle>
                    <Chip
                        label={status?.toUpperCase() || 'ACTIVE'}
                        size="small"
                        color={getStatusColor(status)}
                        sx={{ fontSize: '11px', fontWeight: 600 }}
                    />
                    <span>•</span>
                    <span>{tierName}</span>
                    {hasMultipleTickets && (
                        <>
                            <span>•</span>
                            <span style={{ color: '#4f46e5' }}>
                                Ticket {currentIndex + 1} of {totalTickets}
                            </span>
                        </>
                    )}
                </EventSubtitle>

                <DetailGrid>
                    <DetailItem>
                        <div className="label">
                            <CalendarIcon sx={{ fontSize: 14 }} /> Show Date
                        </div>
                        <div className="value">{eventDate}</div>
                    </DetailItem>
                    <DetailItem>
                        <div className="label">
                            <AccessTimeIcon sx={{ fontSize: 14 }} /> Show Time
                        </div>
                        <div className="value">{eventTime}</div>
                    </DetailItem>
                    <DetailItem>
                        <div className="label">
                            <LocationIcon sx={{ fontSize: 14 }} /> Venue
                        </div>
                        <div className="value">{venueName}</div>
                        {venueAddress && <div className="value-sm">{venueAddress}</div>}
                    </DetailItem>
                    <DetailItem>
                        <div className="label">
                            <TicketIcon sx={{ fontSize: 14 }} /> Seat(s)
                        </div>
                        <div className="value">{seatInfo || 'N/A'}</div>
                    </DetailItem>
                    <DetailItem>
                        <div className="label">
                            <PersonIcon sx={{ fontSize: 14 }} /> Attendee
                        </div>
                        <div className="value">{attendeeName}</div>
                        {attendeeEmail && <div className="value-sm">{attendeeEmail}</div>}
                    </DetailItem>
                    <DetailItem>
                        <div className="label">
                            <LocalOfferIcon sx={{ fontSize: 14 }} /> Price
                        </div>
                        <div className="value">₹{price?.toLocaleString() || '0'}</div>
                        <div className="value-sm">Tier: {tierName}</div>
                    </DetailItem>
                </DetailGrid>

                <DividerLine />

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#64748b'
                }}>
                    <div style={{ wordBreak: 'break-all' }}>
                        <span style={{ fontWeight: 500 }}>Order No:</span> {orderNumber}
                    </div>
                    <div style={{ wordBreak: 'break-all' }}>
                        <span style={{ fontWeight: 500 }}>Transaction:</span> {transactionId}
                    </div>
                </div>
            </DetailsSection>

            {hasMultipleTickets && showNavigation && (
                <>
                    <DividerLine style={{ margin: '0 28px' }} />
                    <NavigationControls>
                        <NavButton onClick={handlePrev} disabled={currentIndex === 0}>
                            <NavigateBeforeIcon />
                        </NavButton>
                        <TicketIndicator>
                            {allTickets.map((_, idx) => (
                                <Dot key={idx} active={idx === currentIndex} />
                            ))}
                        </TicketIndicator>
                        <NavButton onClick={handleNext} disabled={currentIndex === totalTickets - 1}>
                            <NavigateNextIcon />
                        </NavButton>
                    </NavigationControls>
                </>
            )}

            <TicketFooter>
                <div className="footer-item">
                    <EventIcon sx={{ fontSize: 14 }} />
                    {eventDate}
                </div>
                <div className="footer-item">
                    <LocationIcon sx={{ fontSize: 14 }} />
                    {venueName}
                </div>
                <div className="footer-item">
                    <TicketIcon sx={{ fontSize: 14 }} />
                    {hasMultipleTickets ? `${currentIndex + 1}/${totalTickets}` : ticketCode}
                </div>
            </TicketFooter>

            {showActions && (
                <Box sx={{
                    padding: isMobile ? '12px 16px' : '12px 28px',
                    backgroundColor: '#ffffff',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    gap: 1,
                    justifyContent: 'center',
                    flexWrap: 'wrap'
                }}>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={handleDownload}
                        sx={{
                            minHeight: 44,
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            textTransform: 'none',
                            '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: '0 4px 16px rgba(79, 70, 229, 0.3)'
                            }
                        }}
                    >
                        📥 Download
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={handlePrint}
                        sx={{
                            minHeight: 44,
                            borderColor: '#e2e8f0',
                            color: '#475569',
                            textTransform: 'none',
                            '&:hover': {
                                borderColor: '#4f46e5',
                                color: '#4f46e5'
                            }
                        }}
                    >
                        🖨️ Print
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={handleEmail}
                        sx={{
                            minHeight: 44,
                            borderColor: '#e2e8f0',
                            color: '#475569',
                            textTransform: 'none',
                            '&:hover': {
                                borderColor: '#4f46e5',
                                color: '#4f46e5'
                            }
                        }}
                    >
                        ✉️ Email
                    </Button>
                </Box>
            )}
        </TicketContainer>
    );
};

export default Ticket;