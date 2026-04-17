#!/usr/bin/env python3

import requests
import json

# Test the vegan filtering
url = "http://localhost:8080/predict/"
data = {
    "pregnancy_info": {
        "pregnancy_month": 5,
        "age": 28,
        "pre_pregnancy_weight": 60.0,
        "current_weight": 65.0,
        "height": 165.0,
        "has_gestational_diabetes": False,
        "has_anemia": True,
        "has_morning_sickness": False,
        "has_heartburn": False,
        "has_constipation": False,
        "medications": [],
        "food_aversions": [],
        "food_cravings": [],
        "dietary_restrictions": ["Vegan", "Dairy-free"],
        "activity_level": "moderate"
    },
    "ingredients": ["tofu", "vegetables"],
    "params": {
        "n_neighbors": 5,
        "return_distance": False
    }
}

try:
    response = requests.post(url, json=data, timeout=30)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    # Check for animal products in recommendations
    if response.status_code == 200:
        recommendations = response.json()
        print("\n=== CHECKING FOR NON-VEGAN INGREDIENTS ===")
        non_vegan_found = False
        
        for i, recipe in enumerate(recommendations.get('recommendations', [])):
            name = recipe.get('Name', 'Unknown')
            ingredients = recipe.get('RecipeIngredientParts', [])
            
            print(f"\nRecipe {i+1}: {name}")
            print(f"Ingredients: {ingredients}")
            
            # Check for non-vegan ingredients
            non_vegan_ingredients = []
            if isinstance(ingredients, list):
                for ingredient in ingredients:
                    ingredient_lower = str(ingredient).lower()
                    if any(animal in ingredient_lower for animal in ['chicken', 'beef', 'fish', 'pork', 'turkey', 'lamb', 'meat', 'egg', 'milk', 'cheese', 'butter', 'cream', 'yogurt']):
                        non_vegan_ingredients.append(ingredient)
            
            if non_vegan_ingredients:
                non_vegan_found = True
                print(f"❌ NON-VEGAN INGREDIENTS FOUND: {non_vegan_ingredients}")
            else:
                print("✅ This recipe appears vegan-friendly")
        
        if not non_vegan_found:
            print("\n🎉 SUCCESS: All recipes appear to be vegan!")
        else:
            print("\n❌ FAILURE: Non-vegan ingredients found in recommendations!")
            
except requests.exceptions.RequestException as e:
    print(f"Request Error: {e}")
except json.JSONDecodeError as e:
    print(f"JSON Decode Error: {e}")
except KeyError as e:
    print(f"Key Error: {e}")
except Exception as e:
    print(f"Unexpected Error: {e}")
