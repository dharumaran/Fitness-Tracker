// Fetch user profile data (steps, water intake, etc.)
async function fetchUserData() {
    const response = await fetch('/profile');
    const data = await response.json();

    // Update water intake data
    document.getElementById('water').innerText = `Water Intake: ${data.water_intake} liters`;

    // Prepare chart data for steps
    const stepsData = {
        labels: ['Steps Taken', 'Goal Steps'],
        datasets: [{
            label: 'Steps Progress',
            data: [data.steps_taken, data.goal_steps],
            backgroundColor: ['rgba(75, 192, 192, 0.2)', 'rgba(255, 99, 132, 0.2)'],
            borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
            borderWidth: 1
        }]
    };

    // Render the chart
    const ctx = document.getElementById('chart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut', // Half circle chart
        data: stepsData
    });
}

// Fetch user data when the page loads
window.onload = fetchUserData;
