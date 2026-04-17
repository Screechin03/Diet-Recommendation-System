# Diet Recommendation System - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Features & Functionalities](#features--functionalities)
4. [Algorithms & Machine Learning](#algorithms--machine-learning)
5. [Technologies Used](#technologies-used)
6. [Installation & Setup](#installation--setup)
7. [API Documentation](#api-documentation)
8. [User Guide](#user-guide)
9. [Technical Implementation Details](#technical-implementation-details)
10. [Future Enhancements](#future-enhancements)

---

## Overview

The **Diet Recommendation System** is an intelligent, pregnancy-focused nutrition platform that provides personalized meal planning and dietary recommendations for pregnant women. The system uses machine learning algorithms to analyze health data and generate customized meal plans that address specific pregnancy conditions, dietary restrictions, and nutritional requirements.

### Key Objectives
- Provide personalized meal recommendations based on pregnancy stage and health conditions
- Monitor and predict pregnancy risk levels using machine learning
- Generate balanced weekly meal plans with nutritional analysis
- Support various dietary restrictions (Vegan, Vegetarian, Gluten-free, etc.)
- Offer real-time health monitoring and analytics

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                           │
│              (Streamlit Web Application)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Diet Planner │  │Recipe Finder │  │   Analytics  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST API
┌────────────────────────▼────────────────────────────────────┐
│                     Backend Layer                            │
│                 (FastAPI Application)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Recipe Recommendation Engine                  │  │
│  │    (Content-Based Filtering Algorithm)               │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │       Pregnancy Risk Prediction Model                 │  │
│  │      (Random Forest Classifier - ML Model)            │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                     Data Layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Recipe DB   │  │  Health Data │  │   ML Model   │     │
│  │  (CSV/JSON)  │  │    (CSV)     │  │    (.pkl)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- Streamlit 1.16.0 - Web framework
- Plotly 5.11.0 - Interactive visualizations
- Pandas 1.5.1 - Data manipulation
- NumPy 1.24.1 - Numerical computing

**Backend:**
- FastAPI 0.88.0 - REST API framework
- Uvicorn 0.20.0 - ASGI server
- Scikit-learn - Machine learning

**Deployment:**
- Docker - Containerization
- Docker Compose - Multi-container orchestration

---

## Features & Functionalities

### 1. Diet Planner (Page 1)

#### 1.1 Health Profile Management
**Description:** Comprehensive health data collection for personalized recommendations.

**Input Parameters:**
- **Basic Information:**
  - Age (years)
  - Height (cm)
  - Pre-pregnancy weight (kg)
  - Current pregnancy weight (kg)
  - Pregnancy month (1-9)
  - Activity level (sedentary/moderate/active)

- **Health Conditions:**
  - Gestational diabetes (Yes/No)
  - Anemia (Yes/No)
  - Morning sickness (Yes/No)
  - Heartburn (Yes/No)
  - Constipation (Yes/No)
  - Previous pregnancy complications (Yes/No)
  - Pre-existing diabetes (Yes/No)

- **Vital Signs:**
  - Blood pressure (systolic/diastolic)
  - Blood sugar level (mmol/L)
  - Body temperature (°F)
  - Heart rate (bpm)

- **Lifestyle Factors:**
  - Smoking history (Yes/No)
  - Alcohol consumption (none/occasional/regular)
  - Exercise frequency (daily/weekly/monthly/rarely)
  - Sleep hours per night
  - Stress level (low/medium/high)
  - Mental health concerns (Yes/No)

**Outputs:**
- Risk level prediction (Low/Medium/High)
- Risk percentage score
- BMI calculation and status
- Weight gain analysis
- Trimester identification
- Personalized health recommendations

#### 1.2 Pregnancy Risk Prediction

**Algorithm:** Random Forest Classifier

**Description:** Machine learning model that predicts pregnancy risk levels based on comprehensive health data.

**Features Used:**
- Age
- Systolic and diastolic blood pressure
- Blood sugar levels
- Body temperature
- Heart rate
- Previous complications flag
- Diabetes indicators
- Mental health status
- Lifestyle factors (smoking, alcohol, exercise)
- Sleep patterns
- Stress levels

**Model Performance:**
- Algorithm: Random Forest with 100 estimators
- Training data: Health records dataset
- Output: Risk classification (Low/Medium/High) with probability scores

**Implementation:**
```python
# Model training pseudocode
features = ['Age', 'SystolicBP', 'DiastolicBP', 'BS', 'BodyTemp', 
            'HeartRate', 'Previous_Complications', 'Diabetes', ...]
X = health_data[features]
y = health_data['RiskLevel']

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X, y)
```

#### 1.3 Nutritional Recommendations

**Algorithm:** Rule-Based Expert System

**Description:** Generates personalized nutritional advice based on health conditions, pregnancy stage, and risk factors.

**Rules Implementation:**
- **Gestational Diabetes:** Low glycemic index foods, controlled carbohydrate intake
- **Anemia:** Iron-rich foods, vitamin C for absorption
- **Morning Sickness:** Small frequent meals, ginger-based foods
- **Heartburn:** Non-acidic foods, smaller portions
- **Constipation:** High-fiber foods, increased water intake
- **Trimester-specific:** Adjusted caloric and nutritional needs

#### 1.4 Interactive Visualizations

**Charts & Analytics:**
1. **Risk Distribution Gauge Chart**
   - Visual risk level indicator
   - Color-coded (green/yellow/red)
   
2. **Health Metrics Dashboard**
   - BMI status
   - Weight gain progress
   - Vital signs comparison

3. **Nutritional Requirements Chart**
   - Daily caloric needs by trimester
   - Macronutrient distribution

### 2. Recipe Finder (Page 2)

#### 2.1 Personalized Meal Plan Generation

**Algorithm:** Hybrid Recommendation System (Content-Based + Rule-Based)

**Description:** Generates a 4-day weekly meal plan with 4 meal options for each meal type (breakfast, lunch, dinner, snack).

**Process Flow:**
1. **Profile Analysis:** Extract health conditions and dietary restrictions
2. **Ingredient Selection:** Smart ingredient suggestion based on conditions
3. **Recipe Generation:** Create diverse recipes using multiple approaches
4. **Variety Assurance:** Seed-based template selection for uniqueness
5. **Nutritional Validation:** Verify nutritional adequacy

**Meal Plan Structure:**
- 4 days (Monday - Thursday)
- 4 meal types per day (breakfast, lunch, dinner, snack)
- 4 options per meal type
- Total: 64 unique recipe combinations

#### 2.2 Content-Based Recipe Recommendation

**Algorithm:** TF-IDF (Term Frequency-Inverse Document Frequency) + Cosine Similarity

**Description:** Matches user preferences and health requirements with recipe database using natural language processing.

**Implementation:**
```python
# Content-based filtering pseudocode
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Create feature vectors from recipe ingredients
vectorizer = TfidfVectorizer()
ingredient_matrix = vectorizer.fit_transform(recipe_ingredients)

# User preference vector
user_preferences = ['iron', 'protein', 'low glycemic', 'fiber']
user_vector = vectorizer.transform([' '.join(user_preferences)])

# Calculate similarity
similarity_scores = cosine_similarity(user_vector, ingredient_matrix)

# Rank and return top recipes
top_recipes = similarity_scores.argsort()[-10:][::-1]
```

**Features Analyzed:**
- Ingredient composition
- Nutritional content (calories, protein, carbs, fat, fiber)
- Preparation time
- Cooking complexity
- Dietary compliance (vegan, vegetarian, gluten-free)

#### 2.3 Smart Ingredient Suggestion

**Algorithm:** Multi-Criteria Decision Making with Health Condition Mapping

**Description:** Dynamically suggests ingredients based on health conditions, dietary restrictions, and meal type.

**Mapping Rules:**

**Health Condition → Ingredient Mapping:**
```
Anemia → [spinach, lentils, quinoa, lean meat, pumpkin seeds]
Gestational Diabetes → [whole grain, legumes, complex carbs, protein]
Morning Sickness → [ginger, lemon, bland foods, crackers]
Constipation → [fiber, prunes, whole grain, vegetables, beans]
Heartburn → [mild, non-acidic, avoid tomato/citrus]
```

**Dietary Restriction → Substitution Mapping:**
```
Vegan → [plant milk, tofu, nutritional yeast, maple syrup]
Vegetarian → [plant-based protein, keep dairy]
Gluten-free → [gluten-free pasta/bread/flour, rice, quinoa]
Dairy-free → [plant milk, dairy-free cheese/yogurt]
Nut-free → [seeds, nut-free alternatives]
```

#### 2.4 Recipe Variety Assurance

**Algorithm:** Seed-Based Template Selection with Day/Meal/Option Indexing

**Description:** Ensures maximum recipe diversity across days and options using deterministic seeding.

**Implementation:**
```python
def create_fallback_recipe(meal_type, seed=None):
    # Unique seed calculation
    unique_seed = day_idx * 100 + meal_idx * 10 + option_number
    
    # Template selection
    templates = meal_templates[meal_type]  # 4 templates per meal type
    selection_index = seed % len(templates)
    
    # Return unique template
    return templates[selection_index]
```

**Variety Mechanisms:**
1. **Day Themes:** Traditional, International, Modern, Comfort
2. **Cooking Styles:** Simple, Elaborate, Healthy, Comfort
3. **Meal Variations:** Different base ingredients per day
4. **Seed-Based Selection:** Deterministic uniqueness (range 0-343)

#### 2.5 Nutritional Analysis & Visualization

**Charts Provided:**

**2.5.1 Daily Breakdown Chart**
- 4 bar charts showing daily nutrition
- Metrics: Calories, Protein, Carbohydrates, Fat
- Interactive hover for detailed values

**2.5.2 Macronutrient Distribution (Pie Chart)**
- Caloric distribution of macros
- Protein: 20-30% (recommended)
- Carbs: 45-60% (recommended)
- Fat: 20-35% (recommended)
- Compliance indicators (✅/⚠️)

**2.5.3 Nutrient Trends (Line Chart)**
- Multi-line trend analysis across 4 days
- Tracks: Calories, Protein, Carbs, Fat, Fiber
- Dual Y-axis for better visualization

**2.5.4 Pregnancy Targets Comparison**
- Bar chart: Recommended vs Actual intake
- Target metrics:
  - Calories: 2200 kcal (2nd trimester baseline)
  - Protein: 75g
  - Carbohydrates: 175g
  - Fat: 70g
  - Fiber: 28g
- Achievement percentage indicators

**Visualization Technology:**
- Plotly Graph Objects for interactive charts
- Subplots for multi-chart layouts
- Custom color schemes for readability
- Responsive design for various screen sizes

#### 2.6 Recipe Detail View

**Information Displayed:**
- Recipe name with dietary labels
- Preparation and cooking time
- Ingredient list with quantities
- Step-by-step instructions
- Complete nutritional breakdown
- Pregnancy-specific benefits
- Recipe image (with fallback)

#### 2.7 Meal Plan Export

**Features:**
- Export to CSV format
- Includes all selected meals
- Nutritional information per meal
- Preparation and cooking times
- Downloadable file

### 3. Cross-Page Integration

#### 3.1 Session State Management

**Description:** Persistent data sharing between pages using Streamlit session state.

**Shared Data:**
```python
st.session_state.pregnancy_person  # Health profile object
st.session_state.weekly_meal_plan  # Generated meal plan
st.session_state.selected_meals    # User meal selections
st.session_state.health_person     # Health data from planner
```

#### 3.2 Data Flow

```
Diet Planner (Page 1)
    ↓ Creates PregnantWoman object
    ↓ Stores in session_state
    ↓
Recipe Finder (Page 2)
    ↓ Reads PregnantWoman data
    ↓ Generates personalized meal plan
    ↓ Stores selections
```

---

## Algorithms & Machine Learning

### 1. Random Forest Classifier (Pregnancy Risk Prediction)

**Type:** Supervised Learning - Classification

**Algorithm Details:**
- **Ensemble Method:** Combines multiple decision trees
- **Number of Trees:** 100 estimators
- **Splitting Criterion:** Gini impurity
- **Max Depth:** Auto (grows until pure leaves)
- **Random State:** 42 (reproducibility)

**Training Process:**
1. **Data Preprocessing:**
   - Handle missing values
   - Encode categorical variables
   - Normalize numerical features

2. **Feature Engineering:**
   - Derived features (BMI, weight gain rate)
   - Health condition indicators
   - Lifestyle risk scores

3. **Model Training:**
   - Train-test split (80-20)
   - Cross-validation (5-fold)
   - Hyperparameter tuning

4. **Model Evaluation:**
   - Accuracy score
   - Precision, Recall, F1-score
   - Confusion matrix
   - ROC-AUC curve

**Prediction Output:**
```python
{
    'risk_level': 'Medium',  # Low/Medium/High
    'risk_percentage': 45.2,  # Probability score
    'confidence': 0.87,       # Model confidence
    'contributing_factors': [  # Top risk factors
        'High blood pressure',
        'Age > 35',
        'Previous complications'
    ]
}
```

### 2. Content-Based Filtering (Recipe Recommendation)

**Type:** Information Retrieval + Similarity Matching

**Algorithm Steps:**

1. **Text Preprocessing:**
   ```python
   # Combine recipe features
   recipe_text = ingredients + meal_type + dietary_tags
   
   # Clean and tokenize
   recipe_text = clean_text(recipe_text)
   tokens = tokenize(recipe_text)
   ```

2. **TF-IDF Vectorization:**
   ```python
   # Calculate term frequency-inverse document frequency
   TF(term) = (Number of times term appears in recipe) / 
              (Total terms in recipe)
   
   IDF(term) = log(Total recipes / Recipes containing term)
   
   TF-IDF(term) = TF(term) × IDF(term)
   ```

3. **Similarity Computation:**
   ```python
   # Cosine similarity formula
   similarity(A, B) = (A · B) / (||A|| × ||B||)
   
   where:
   A = user preference vector
   B = recipe feature vector
   · = dot product
   ||x|| = vector magnitude
   ```

4. **Ranking & Filtering:**
   - Sort by similarity score
   - Apply dietary filters
   - Apply health condition filters
   - Return top N recipes

**Advantages:**
- No cold start problem
- Explainable recommendations
- Works with new recipes immediately
- Respects dietary constraints

### 3. Rule-Based Expert System (Nutritional Recommendations)

**Type:** Knowledge-Based System

**Architecture:**
```
IF conditions THEN actions

Example Rule:
IF pregnancy_month <= 3 AND has_morning_sickness THEN
    - Recommend small frequent meals
    - Suggest ginger tea
    - Avoid strong odors
    - Include bland carbohydrates
```

**Rule Categories:**

1. **Condition-Based Rules:**
   - Gestational diabetes → Low GI foods
   - Anemia → Iron-rich foods + Vitamin C
   - Heartburn → Small meals, avoid acidic

2. **Trimester-Based Rules:**
   - First trimester → Focus on folate
   - Second trimester → Increase calories (+340)
   - Third trimester → More protein (+450 cal)

3. **Dietary Restriction Rules:**
   - Vegan → Plant-based substitutions
   - Gluten-free → Alternative grains
   - Nut-free → Seed alternatives

**Rule Execution Engine:**
```python
def apply_rules(health_profile):
    recommendations = []
    
    for rule in rule_base:
        if rule.condition(health_profile):
            recommendations.extend(rule.actions())
    
    return prioritize(recommendations)
```

### 4. Seed-Based Diversity Algorithm

**Type:** Deterministic Randomization

**Purpose:** Ensure unique recipes across multiple dimensions (days, meals, options)

**Algorithm:**
```python
# Unique seed generation
seed = day_index * 100 + meal_index * 10 + option_number

# Seed range: 0 to 343 (4 days × 4 meals × 4 options = 64, with padding)

# Template selection
template_index = seed % number_of_templates

# Properties:
# - Deterministic: Same input → Same output
# - Distributed: Even distribution across templates
# - Unique: Each day/meal/option gets different template
```

**Example Seed Distribution:**
```
Monday Breakfast Option 1: seed = 0*100 + 0*10 + 0 = 0
Monday Breakfast Option 2: seed = 0*100 + 0*10 + 1 = 1
Monday Lunch Option 1:     seed = 0*100 + 1*10 + 0 = 10
Tuesday Breakfast Option 1: seed = 1*100 + 0*10 + 0 = 100
```

---

## Technologies Used

### Frontend Technologies

#### Streamlit (1.16.0)
- **Purpose:** Web application framework
- **Features Used:**
  - Multi-page application structure
  - Session state management
  - Form handling
  - File upload/download
  - Custom CSS styling
  - Responsive layouts

#### Plotly (5.11.0)
- **Purpose:** Interactive data visualization
- **Chart Types:**
  - Bar charts (grouped, stacked)
  - Pie charts
  - Line charts (multi-line)
  - Scatter plots
  - Subplots
- **Features:**
  - Hover interactions
  - Zoom and pan
  - Export to PNG
  - Custom styling

#### Pandas (1.5.1)
- **Purpose:** Data manipulation
- **Operations:**
  - DataFrame creation
  - Data filtering
  - Aggregation
  - CSV import/export
  - Data transformation

#### NumPy (1.24.1)
- **Purpose:** Numerical computing
- **Use Cases:**
  - Array operations
  - Mathematical calculations
  - Statistical functions

### Backend Technologies

#### FastAPI (0.88.0)
- **Purpose:** REST API framework
- **Features:**
  - Automatic API documentation
  - Request validation
  - Async support
  - CORS middleware
  - Type hints

**API Structure:**
```python
@app.post("/generate")
async def generate_recipes(pregnancy_info: dict, ingredients: list):
    # Recipe recommendation logic
    return {"output": recipes}

@app.post("/predict_risk")
async def predict_risk(health_data: dict):
    # Risk prediction logic
    return {"risk_level": level, "percentage": score}
```

#### Uvicorn (0.20.0)
- **Purpose:** ASGI server
- **Configuration:**
  - Host: 0.0.0.0
  - Port: 8000
  - Workers: Auto
  - Reload: Development mode

#### Scikit-learn
- **Purpose:** Machine learning
- **Components Used:**
  - RandomForestClassifier
  - TfidfVectorizer
  - cosine_similarity
  - train_test_split
  - StandardScaler

### DevOps & Deployment

#### Docker
- **Purpose:** Containerization
- **Containers:**
  1. Frontend container (Streamlit)
  2. Backend container (FastAPI)

**Dockerfile (Frontend):**
```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8501
CMD ["streamlit", "run", "Hello.py"]
```

#### Docker Compose
- **Purpose:** Multi-container orchestration
- **Services:**
  - frontend: Streamlit (port 8501)
  - backend: FastAPI (port 8000)
- **Network:** Shared bridge network
- **Volumes:** Data persistence

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  backend:
    build: ./FastAPI_Backend
    ports:
      - "8000:8000"
    volumes:
      - ./Data:/app/data
  
  frontend:
    build: ./Streamlit_Frontend
    ports:
      - "8501:8501"
    depends_on:
      - backend
```

### Additional Libraries

#### BeautifulSoup4 (4.11.1)
- **Purpose:** Web scraping (for image finder)
- **Use:** Recipe image URL extraction

#### Requests (2.28.1)
- **Purpose:** HTTP client
- **Use:** API calls between frontend and backend

#### Streamlit-ECharts (0.4.0)
- **Purpose:** Apache ECharts integration
- **Use:** Alternative charting library

---

## Installation & Setup

### Prerequisites
- Python 3.10 or higher
- Docker (optional, for containerized deployment)
- Git

### Local Development Setup

#### 1. Clone Repository
```bash
git clone https://github.com/zakaria-narjis/Diet-Recommendation-System.git
cd Diet-Recommendation-System
```

#### 2. Backend Setup
```bash
cd FastAPI_Backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run backend server
python run_server.py
# Backend will run on http://localhost:8000
```

#### 3. Frontend Setup
```bash
cd Streamlit_Frontend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run frontend
streamlit run Hello.py
# Frontend will open in browser at http://localhost:8501
```

### Docker Deployment

#### 1. Build and Run with Docker Compose
```bash
# From project root directory
docker-compose up --build

# Access application:
# Frontend: http://localhost:8501
# Backend: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

#### 2. Individual Container Build
```bash
# Build backend
cd FastAPI_Backend
docker build -t diet-backend .
docker run -p 8000:8000 diet-backend

# Build frontend
cd Streamlit_Frontend
docker build -t diet-frontend .
docker run -p 8501:8501 diet-frontend
```

### Environment Configuration

#### Backend Environment Variables
```env
# FastAPI_Backend/.env
PORT=8000
HOST=0.0.0.0
RELOAD=True
MODEL_PATH=./pregnancy_risk_model.pkl
DATA_PATH=../Data/dataset.csv
```

#### Frontend Environment Variables
```env
# Streamlit_Frontend/.env
BACKEND_URL=http://localhost:8000
```

---

## API Documentation

### Base URL
```
http://localhost:8000
```

### Endpoints

#### 1. Generate Recipe Recommendations

**Endpoint:** `POST /generate`

**Description:** Generates personalized recipe recommendations based on pregnancy info and ingredient preferences.

**Request Body:**
```json
{
  "pregnancy_info": {
    "pregnancy_month": 5,
    "age": 28,
    "has_gestational_diabetes": false,
    "has_anemia": true,
    "has_morning_sickness": false,
    "has_heartburn": false,
    "has_constipation": false,
    "dietary_restrictions": ["Vegetarian"],
    "food_aversions": ["fish"],
    "food_cravings": ["chocolate"],
    "activity_level": "moderate"
  },
  "ingredients": ["spinach", "lentils", "quinoa", "protein"]
}
```

**Response:**
```json
{
  "output": [
    {
      "Name": "Iron-Rich Quinoa Bowl",
      "RecipeIngredientParts": [
        "quinoa",
        "spinach",
        "lentils",
        "olive oil"
      ],
      "RecipeInstructions": [
        "Cook quinoa according to package",
        "Sauté spinach with olive oil",
        "Mix with cooked lentils",
        "Season to taste"
      ],
      "Calories": 450,
      "ProteinContent": 18,
      "CarbohydrateContent": 65,
      "FatContent": 12,
      "FiberContent": 10,
      "PrepTime": "10",
      "CookTime": "20",
      "TotalTime": "30",
      "pregnancy_benefits": [
        "Rich in iron for anemia",
        "High protein for baby growth",
        "Good source of folate"
      ],
      "image_link": "https://example.com/recipe-image.jpg"
    }
  ]
}
```

#### 2. Predict Pregnancy Risk

**Endpoint:** `POST /predict_risk`

**Description:** Predicts pregnancy risk level using machine learning model.

**Request Body:**
```json
{
  "Age": 32,
  "SystolicBP": 130,
  "DiastolicBP": 85,
  "BS": 7.5,
  "BodyTemp": 98.6,
  "HeartRate": 80,
  "Previous_Complications": true,
  "Diabetes": false,
  "Mental_Health_Issues": false,
  "Smoking": false,
  "Alcohol_Consumption": 0,
  "Exercise_Frequency": 3,
  "Sleep_Hours": 7,
  "Stress_Level": 2
}
```

**Response:**
```json
{
  "risk_level": "Medium",
  "risk_percentage": 45.8,
  "confidence": 0.89,
  "recommendations": [
    "Monitor blood pressure regularly",
    "Maintain moderate exercise routine",
    "Consult with healthcare provider"
  ]
}
```

#### 3. Get Recipe by ID

**Endpoint:** `GET /recipe/{recipe_id}`

**Description:** Retrieves detailed information for a specific recipe.

**Parameters:**
- `recipe_id` (path): Unique recipe identifier

**Response:**
```json
{
  "id": "recipe_123",
  "Name": "Pregnancy Power Bowl",
  "RecipeCategory": "lunch",
  "Keywords": ["healthy", "nutritious", "pregnancy-safe"],
  "RecipeIngredientParts": [...],
  "RecipeInstructions": [...],
  "Calories": 520,
  "NutritionalInfo": {...},
  "PregnancyBenefits": [...]
}
```

#### 4. Health Check

**Endpoint:** `GET /health`

**Description:** Check API server status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-24T10:30:00Z",
  "version": "1.0.0"
}
```

### Error Responses

**Format:**
```json
{
  "detail": "Error message",
  "error_code": "ERROR_CODE",
  "timestamp": "2025-11-24T10:30:00Z"
}
```

**Common Status Codes:**
- `200` - Success
- `400` - Bad Request (invalid input)
- `404` - Not Found
- `422` - Validation Error
- `500` - Internal Server Error

---

## User Guide

### Getting Started

#### Step 1: Access the Application
1. Open web browser
2. Navigate to `http://localhost:8501`
3. You'll see the Home/Welcome page

#### Step 2: Complete Diet Planner (Page 1)

**2.1 Enter Basic Information:**
- Fill in age, height, weight details
- Select current pregnancy month
- Choose activity level

**2.2 Health Conditions:**
- Check any applicable conditions
- Enter vital signs (BP, blood sugar, etc.)
- Provide lifestyle information

**2.3 Dietary Preferences:**
- Select dietary restrictions
- List food aversions
- Note food cravings

**2.4 Generate Analysis:**
- Click "Generate Pregnancy Analysis"
- Review risk prediction
- Read personalized recommendations

#### Step 3: Generate Meal Plan (Page 2)

**3.1 Import Health Data:**
- Data automatically imports from Diet Planner
- Or fill in basic pregnancy info manually

**3.2 Customize Preferences:**
- Add additional dietary restrictions
- Update food preferences if needed

**3.3 Generate Plan:**
- Click "Generate 4-Day Meal Plan"
- Wait for recipe generation (1-2 minutes)

**3.4 Explore Meal Options:**
- Browse 4 days of meals
- Each meal has 4 options to choose from
- Select preferred recipes from dropdowns

**3.5 View Nutritional Analysis:**
- Click through chart tabs:
  - Daily Breakdown
  - Macronutrient Distribution
  - Nutrient Trends
  - Pregnancy Targets

**3.6 Export Meal Plan:**
- Scroll to bottom
- Click "Export Meal Plan"
- Download CSV file

### Tips for Best Results

1. **Be Honest with Health Data:**
   - Accurate data = Better recommendations
   - Include all relevant conditions

2. **Update Regularly:**
   - Regenerate plan as pregnancy progresses
   - Update weight and conditions monthly

3. **Explore Options:**
   - Try different recipe options
   - Mix and match for variety

4. **Consult Healthcare Provider:**
   - Use as supplementary tool
   - Discuss major dietary changes with doctor

---

## Technical Implementation Details

### Data Models

#### PregnantWoman Class
```python
class PregnantWoman:
    def __init__(self, person_age, person_height, pre_preg_weight, 
                 current_preg_weight, preg_month, gestational_diabetes, 
                 anemia_condition, ...):
        # Personal attributes
        self.age = person_age
        self.height = person_height
        self.pregnancy_month = preg_month
        
        # Health conditions
        self.has_gestational_diabetes = gestational_diabetes
        self.has_anemia = anemia_condition
        
        # Methods
        self.get_trimester()
        self.calculate_weight_gain_status()
        self.generate_weekly_meal_plan()
```

#### Recipe Data Structure
```python
{
    "Name": str,
    "RecipeCategory": str,
    "RecipeIngredientParts": List[str],
    "RecipeInstructions": List[str],
    "Calories": float,
    "ProteinContent": float,
    "CarbohydrateContent": float,
    "FatContent": float,
    "FiberContent": float,
    "PrepTime": str,
    "CookTime": str,
    "TotalTime": str,
    "pregnancy_benefits": List[str],
    "image_link": str,
    "approach_style": str,  # Simple/Elaborate/Healthy/Comfort
    "option_number": int
}
```

### Key Algorithms Implementation

#### 1. Weight Gain Status Calculation
```python
def calculate_weight_gain_status(self):
    weight_gain = self.current_weight - self.pre_pregnancy_weight
    pre_bmi = self.pre_pregnancy_weight / ((self.height/100)**2)
    
    # BMI-based recommended ranges
    if pre_bmi < 18.5:  # Underweight
        min_gain, max_gain = 12.5, 18
    elif 18.5 <= pre_bmi < 25:  # Normal
        min_gain, max_gain = 11.5, 16
    elif 25 <= pre_bmi < 30:  # Overweight
        min_gain, max_gain = 7, 11.5
    else:  # Obese
        min_gain, max_gain = 5, 9
    
    # Adjust for pregnancy month
    expected_gain = (max_gain + min_gain) / 2 * (self.pregnancy_month / 9)
    
    # Determine status
    if weight_gain < min_gain * (self.pregnancy_month / 9):
        status = "Below recommended range"
    elif weight_gain > max_gain * (self.pregnancy_month / 9):
        status = "Above recommended range"
    else:
        status = "Within recommended range"
    
    return weight_gain, status, expected_gain
```

#### 2. Smart Ingredient Suggestion
```python
def get_smart_ingredient_suggestions(self, meal_type):
    base_ingredients = []
    
    # Base by meal type
    if meal_type == 'breakfast':
        if 'Vegan' in self.dietary_restrictions:
            base_ingredients = ['oats', 'plant milk', 'banana', 'berries']
        else:
            base_ingredients = ['eggs', 'whole grain', 'fruit', 'protein']
    
    # Health condition modifications
    if self.has_anemia:
        base_ingredients.extend(['spinach', 'lentils', 'iron', 'lean meat'])
    
    if self.has_gestational_diabetes:
        low_gi_foods = ['whole grain', 'legumes', 'protein', 'quinoa']
        base_ingredients = [ing for ing in base_ingredients 
                           if 'fruit' not in ing.lower()]
        base_ingredients.extend(low_gi_foods)
    
    # Remove aversions
    for aversion in self.food_aversions:
        base_ingredients = [ing for ing in base_ingredients 
                           if aversion.lower() not in ing.lower()]
    
    return base_ingredients
```

#### 3. Recipe Variety Generation
```python
def _get_meal_variations(self, meal_type, day_idx):
    # Day themes
    day_themes = {
        0: {'theme': 'Traditional', 'style': 'Classic'},
        1: {'theme': 'International', 'style': 'Fusion'},
        2: {'theme': 'Modern', 'style': 'Creative'},
        3: {'theme': 'Comfort', 'style': 'Hearty'}
    }
    
    # Meal-specific variations
    variations = {
        'breakfast': [
            ['oatmeal', 'porridge', 'grain-based', 'warm'],
            ['smoothie bowl', 'acai', 'cold', 'blended'],
            ['pancakes', 'waffles', 'fluffy', 'sweet'],
            ['savory toast', 'avocado', 'eggs', 'protein']
        ]
    }
    
    # Combine theme and variation
    current_theme = day_themes[day_idx % 4]
    base_variation = variations[meal_type][day_idx]
    
    return base_variation + current_theme['modifiers']
```

### Performance Optimizations

#### 1. Recipe Generation Batching
- Generate 4 recipes simultaneously per meal
- Parallel API calls where possible
- Fallback recipes cached in memory

#### 2. Session State Caching
- Health profile stored once
- Meal plan persists across page navigation
- Prevents redundant calculations

#### 3. Lazy Loading
- Charts rendered only when tab selected
- Images loaded on-demand
- Progress indicators for long operations

### Error Handling

#### Frontend Error Handling
```python
try:
    # Recipe generation
    batch_recipes = self._generate_recipe_batch(...)
except Exception as e:
    st.warning(f"Error generating recipes: {str(e)}")
    # Fallback to template recipes
    meal_options = [self.create_fallback_recipe(meal) for _ in range(4)]
```

#### Backend Error Handling
```python
@app.post("/generate")
async def generate_recipes(request: RecipeRequest):
    try:
        recipes = recommendation_engine.generate(request)
        return {"output": recipes}
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Recipe generation failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
```

---

## Future Enhancements

### Short-term Improvements (3-6 months)

1. **User Authentication & Profiles**
   - User accounts with login
   - Save multiple pregnancy profiles
   - Track progress over time

2. **Mobile Application**
   - React Native mobile app
   - Push notifications for meal reminders
   - Offline mode for recipes

3. **Enhanced ML Models**
   - Deep learning for risk prediction
   - Collaborative filtering for recipes
   - Personalized portion size recommendations

4. **Shopping List Integration**
   - Auto-generate grocery lists
   - Integration with online grocery services
   - Price comparison features

5. **Social Features**
   - Share recipes with community
   - User reviews and ratings
   - Recipe modifications and tips

### Medium-term Enhancements (6-12 months)

1. **Nutritionist Dashboard**
   - Professional portal
   - Client management
   - Custom meal plan creation
   - Progress monitoring

2. **Wearable Device Integration**
   - Fitbit, Apple Watch sync
   - Real-time health metrics
   - Activity tracking
   - Sleep pattern analysis

3. **Voice Assistant Integration**
   - Alexa/Google Home compatibility
   - Voice-guided cooking instructions
   - Hands-free recipe browsing

4. **Meal Prep Guides**
   - Batch cooking recommendations
   - Storage instructions
   - Reheating guidelines

5. **Allergy Testing Integration**
   - Connect with allergy test results
   - Advanced allergen filtering
   - Cross-contamination warnings

### Long-term Vision (12+ months)

1. **AI Chatbot Nutritionist**
   - Natural language queries
   - Real-time dietary advice
   - Symptom-based recommendations

2. **Genetic Profile Integration**
   - DNA-based nutritional needs
   - Predisposition analysis
   - Personalized supplement recommendations

3. **Telemedicine Integration**
   - Video consultations
   - Healthcare provider access
   - Prescription integration

4. **Global Recipe Database**
   - Multi-cuisine support
   - Cultural dietary practices
   - Regional ingredient availability

5. **Postpartum Extension**
   - Breastfeeding nutrition
   - Postpartum recovery meals
   - Baby food introduction guidance

---

## Contributing

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Style Guidelines

- Follow PEP 8 for Python code
- Use type hints where possible
- Write docstrings for all functions/classes
- Include unit tests for new features

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support & Contact

### Issues & Bug Reports
- GitHub Issues: [github.com/zakaria-narjis/Diet-Recommendation-System/issues](https://github.com/zakaria-narjis/Diet-Recommendation-System/issues)

### Documentation
- Full Documentation: This file
- API Documentation: http://localhost:8000/docs (when running)

### Maintainers
- **Zakaria Narjis** - Project Lead
- **Contributors** - See [CONTRIBUTORS.md](CONTRIBUTORS.md)

---

## Disclaimer

This application is designed to provide general nutritional information and meal suggestions for pregnant women. It is **NOT** a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your healthcare provider with any questions you may have regarding your pregnancy, diet, or medical condition.

The machine learning models used in this application are trained on available datasets and may not account for all individual circumstances. Risk predictions should be discussed with qualified healthcare professionals.

---

## Acknowledgments

- **Scikit-learn**: Machine learning library
- **Streamlit**: Web application framework
- **FastAPI**: Modern web framework for APIs
- **Plotly**: Interactive visualization library
- **Recipe Dataset**: [Source if applicable]
- **Health Data**: [Source if applicable]
- **Community Contributors**: Thank you to all who have contributed!

---

## Version History

### Version 1.0.0 (Current)
- Initial release
- Diet Planner with risk prediction
- Recipe Finder with 4-day meal plans
- Interactive nutritional charts
- Docker deployment support

### Planned Versions

**Version 1.1.0** (Q1 2026)
- User authentication
- Save meal plan history
- Enhanced recipe filters
- Mobile responsive improvements

**Version 2.0.0** (Q2 2026)
- Mobile app launch
- Advanced ML models
- Social features
- Shopping list integration

---

*Last Updated: November 24, 2025*
*Documentation Version: 1.0.0*
