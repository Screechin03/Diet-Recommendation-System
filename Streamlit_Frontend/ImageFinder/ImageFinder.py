import requests
from bs4 import BeautifulSoup

Not_found_link='data:image/png;base64,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'

def get_images_links(searchTerm):
    """
    Get food image links using multiple methods for better reliability
    """
    try:
        # Method 1: Try Unsplash for high-quality food images
        clean_term = searchTerm.replace(' ', ',').replace('&', '').replace('#', '')
        unsplash_url = f"https://source.unsplash.com/400x300/?{clean_term},food"
        
        # Test if the URL is accessible
        response = requests.head(unsplash_url, timeout=5)
        if response.status_code == 200:
            return unsplash_url
            
    except:
        pass
    
    try:
        # Method 2: Use predefined food images based on keywords
        recipe_lower = searchTerm.lower()
        
        # Define image mappings for common recipe types
        image_mappings = {
            'breakfast': "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'oat': "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'smoothie': "https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'toast': "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'salad': "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'wrap': "https://images.unsplash.com/photo-1565299585323-38174c4a6ead?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'soup': "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'salmon': "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'pasta': "https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'stir': "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'quinoa': "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'tofu': "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'thai': "https://images.unsplash.com/photo-1559847844-5315695dadae?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'pad': "https://images.unsplash.com/photo-1559847844-5315695dadae?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'chili': "https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'chilli': "https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'nut': "https://images.unsplash.com/photo-1508747703725-719777637510?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'snack': "https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'bowl': "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'dinner': "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'lunch': "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb",
            'crackers': "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb"
        }
        
        # Find matching image
        for keyword, image_url in image_mappings.items():
            if keyword in recipe_lower:
                return image_url
                
    except:
        pass
    
    # Fallback to a default food image
    try:
        return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop&crop=entropy&cs=tinysrgb"
    except:
        return Not_found_link

def get_recipe_specific_image(recipe_name):
    """
    Get a more specific image based on recipe type - wrapper for backwards compatibility
    """
    return get_images_links(recipe_name)
