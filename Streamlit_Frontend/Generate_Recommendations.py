import requests
import json

class Generator:
    def __init__(self, pregnancy_info: dict, ingredients: list = [], params: dict = {'n_neighbors': 5, 'return_distance': False}):
        self.pregnancy_info = pregnancy_info
        self.ingredients = ingredients
        self.params = params

    def set_request(self, pregnancy_info: dict, ingredients: list, params: dict):
        self.pregnancy_info = pregnancy_info
        self.ingredients = ingredients
        self.params = params

    def generate(self):
        request = {
            'pregnancy_info': self.pregnancy_info,
            'ingredients': self.ingredients,
            'params': self.params
        }
        try:
            response = requests.post(
                url='http://localhost:8080/predict/', 
                json=request,  # Use json parameter instead of data=json.dumps
                headers={'Content-Type': 'application/json'},
                timeout=30  # Add timeout
            )
            return response
        except requests.exceptions.Timeout:
            print("Request timed out")
            raise
        except requests.exceptions.ConnectionError:
            print("Connection error to API server")
            raise
        except Exception as e:
            print(f"Error in API request: {e}")
            raise
