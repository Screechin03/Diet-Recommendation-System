import streamlit as st

st.set_page_config(
    page_title="Pregnancy Nutrition Guide",
    page_icon="❤",
)

st.write("# Welcome to Pregnancy Nutrition Guide!")

st.sidebar.success("Select a nutrition tool from the sidebar.")

st.markdown(
    """
    A specialized nutrition recommendation system designed specifically for pregnant women. 
    Get personalized meal recommendations based on your pregnancy stage, health conditions, 
    and nutritional needs.
    
    ### Features:
    - **Trimester-specific nutrition**: Recommendations adapted to your pregnancy month
    - **Health condition support**: Special diets for gestational diabetes, anemia, morning sickness
    - **Safe food filtering**: Automatically excludes foods unsafe during pregnancy
    - **Nutritional benefits**: Each recipe includes pregnancy-specific health benefits
    
    ### How to use:
    1. **Pregnancy Diet Planner** - Get complete meal plans based on your pregnancy profile
    2. **Custom Recipe Finder** - Find specific recipes with pregnancy-safe ingredients
    
    ---
    *Always consult with your healthcare provider before making significant dietary changes during pregnancy.*
    """
)
