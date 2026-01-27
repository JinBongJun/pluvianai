"""
SSRF (Server-Side Request Forgery) protection utilities.
"""

import ipaddress
from typing import Dict, List, Optional
from urllib.parse import urlparse
from app.core.logging_config import logger


def is_private_ip(ip: str) -> bool:
    """
    Check if an IP address is in a private/reserved range
    
    Args:
        ip: IP address string (IPv4 or IPv6)
    
    Returns:
        True if IP is private/reserved, False otherwise
    """
    try:
        ip_obj = ipaddress.ip_address(ip)
        return ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved
    except ValueError:
        # Invalid IP format
        return True  # Treat invalid IPs as unsafe


def extract_host_from_url(url: str) -> Optional[str]:
    """
    Extract hostname or IP from URL
    
    Args:
        url: URL string
    
    Returns:
        Hostname or IP address, or None if invalid
    """
    try:
        parsed = urlparse(url)
        return parsed.hostname
    except Exception as e:
        logger.warning(f"Failed to parse URL: {url}, error: {str(e)}")
        return None


def validate_url(url: str, allowed_domains: List[str]) -> bool:
    """
    Validate URL to prevent SSRF attacks.
    
    Args:
        url: URL to validate
        allowed_domains: List of allowed domain names
        
    Returns:
        True if URL is safe, False otherwise
    """
    try:
        parsed = urlparse(url)
        
        # Protocol validation
        if parsed.scheme not in ['https', 'http']:
            logger.warning(f"Invalid protocol in URL: {url}, scheme: {parsed.scheme}")
            return False
        
        if parsed.scheme == 'http':
            logger.warning(f"HTTP protocol used (should use HTTPS): {url}")
        
        # Port validation (only standard ports: 80, 443)
        if parsed.port and parsed.port not in [80, 443]:
            logger.warning(f"Non-standard port in URL: {url}, port: {parsed.port}")
            return False
        
        # Hostname validation
        hostname = parsed.hostname
        if not hostname:
            logger.warning(f"No hostname in URL: {url}")
            return False
        
        # Reject IP addresses (must use domain names)
        try:
            ipaddress.ip_address(hostname)
            logger.warning(f"IP address used instead of domain name: {url}")
            return False
        except ValueError:
            pass  # Not an IP address, continue
        
        # Domain whitelist check (exact match or subdomain)
        hostname_lower = hostname.lower()
        for allowed_domain in allowed_domains:
            allowed_lower = allowed_domain.lower()
            if hostname_lower == allowed_lower or hostname_lower.endswith(f'.{allowed_lower}'):
                return True
        
        logger.warning(
            f"Hostname not in allowed domains: {url}, "
            f"hostname: {hostname}, allowed: {allowed_domains}"
        )
        return False
        
    except Exception as e:
        logger.error(f"Error validating URL: {url}, error: {str(e)}", exc_info=True)
        return False


def validate_provider_url(
    url: str,
    provider: str,
    provider_urls: Dict[str, str]
) -> bool:
    """
    Validate URL for a specific provider.
    
    Args:
        url: URL to validate
        provider: Provider name (e.g., 'openai', 'anthropic', 'google')
        provider_urls: Dictionary mapping provider names to base URLs
    
    Returns:
        True if URL is safe for the provider, False otherwise
    """
    if provider not in provider_urls:
        logger.warning(f"Unknown provider: {provider}")
        return False
    
    base_url = provider_urls[provider]
    parsed_base = urlparse(base_url)
    allowed_domain = parsed_base.hostname
    
    if not allowed_domain:
        logger.error(f"Invalid base URL for provider {provider}: {base_url}")
        return False
    
    return validate_url(url, [allowed_domain])
